import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL, fetchFile } from '@ffmpeg/util';
const BASE_FPS = 30;
const MAX_PICK_EVERY = 60;

interface ClientTimelapseOptions {
  videoBlob: Blob;
  recordingSeconds: number;
  outputSeconds: number;
  aspectRatio: string;
  onProgress: (percent: number) => void;
}

// FFmpeg 싱글턴
let ffmpeg: FFmpeg | null = null;

async function getFFmpeg(onProgress: (percent: number) => void): Promise<FFmpeg> {
  if (ffmpeg && ffmpeg.loaded) return ffmpeg;

  ffmpeg = new FFmpeg();

  ffmpeg.on('progress', ({ progress }) => {
    onProgress(Math.round(progress * 100));
  });

  ffmpeg.on('log', ({ message }) => {
    console.log(`[FFmpeg] ${message}`);
  });

  // WASM 로드 (CDN)
  const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  return ffmpeg;
}

/**
 * 타임랩스 파라미터 계산 (백엔드 로직 그대로)
 */
function calcTimelapseParams(
  totalFrames: number,
  outputSeconds: number,
): { case_: string; pickEvery: number; outputFps: number } {
  const neededFrames = BASE_FPS * outputSeconds;

  // case2: 프레임 부족
  if (totalFrames <= neededFrames) {
    console.log(`case2: frames=${totalFrames} <= needed=${neededFrames}`);
    return { case_: 'case2', pickEvery: 1, outputFps: BASE_FPS };
  }

  let pickEvery = Math.floor(totalFrames / neededFrames);

  // case1: 정상 범위
  if (pickEvery <= MAX_PICK_EVERY) {
    console.log(`case1: pickEvery=${pickEvery}, ${BASE_FPS}fps`);
    return { case_: 'case1', pickEvery, outputFps: BASE_FPS };
  }

  // case3: 프레임 과다
  const usableFrames = Math.floor(totalFrames / MAX_PICK_EVERY);
  let adjustedFps = Math.ceil(usableFrames / outputSeconds);
  adjustedFps = Math.min(adjustedFps, 240);

  const actualNeeded = adjustedFps * outputSeconds;
  pickEvery = Math.max(1, Math.floor(totalFrames / actualNeeded));

  console.log(`case3: frames=${totalFrames}, pickEvery=${pickEvery}, ${adjustedFps}fps`);
  return { case_: 'case3', pickEvery, outputFps: adjustedFps };
}

/**
 * 비율별 crop/scale 필터 (백엔드 로직 그대로)
 */
function getCropAndScale(aspectRatio: string): { crop: string; scale: string; pad: string } {
  const configs: Record<string, { crop: string; scale: string; pad: string }> = {
    '9:16': {
      crop: 'crop=trunc(ih*9/16/2)*2:ih:(iw-trunc(ih*9/16/2)*2)/2:0',
      scale: 'scale=1080:1920',
      pad: 'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black',
    },
    '1:1': {
      crop: 'crop=trunc(ih/2)*2:trunc(ih/2)*2:(iw-trunc(ih/2)*2)/2:0',
      scale: 'scale=1080:1080',
      pad: 'pad=1080:1080:(ow-iw)/2:(oh-ih)/2:black',
    },
    '4:5': {
      crop: 'crop=trunc(ih*4/5/2)*2:ih:(iw-trunc(ih*4/5/2)*2)/2:0',
      scale: 'scale=1080:1350',
      pad: 'pad=1080:1350:(ow-iw)/2:(oh-ih)/2:black',
    },
    '16:9': {
      crop: '',
      scale: 'scale=1920:1080',
      pad: 'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:black',
    },
  };
  return configs[aspectRatio] || configs['16:9'];
}

/**
 * 프론트에서 타임랩스 생성 (FFmpeg.wasm, 백엔드와 동일한 로직)
 */
export async function createClientTimelapse({
  videoBlob,
  recordingSeconds,
  outputSeconds,
  aspectRatio,
  onProgress,
}: ClientTimelapseOptions): Promise<Blob> {
  onProgress(0);

  const ff = await getFFmpeg(onProgress);

  // 입력 파일 쓰기
  const inputExt = videoBlob.type.includes('mp4') ? 'mp4' : 'webm';
  const inputName = `input.${inputExt}`;
  const outputName = 'output.mp4';

  await ff.writeFile(inputName, await fetchFile(videoBlob));

  // 프레임 수 / 길이 추정
  const duration = recordingSeconds > 0 ? recordingSeconds : 60;
  const totalFrames = Math.round(duration * 30); // 30fps 가정

  const { case_, outputFps } = calcTimelapseParams(totalFrames, outputSeconds);

  // 샘플 fps 계산
  let sampleFps: number;
  if (case_ === 'case2') {
    sampleFps = BASE_FPS;
  } else {
    const neededFrames = outputFps * outputSeconds;
    sampleFps = neededFrames / duration;
  }

  // 필터 조립
  const { crop, scale, pad } = getCropAndScale(aspectRatio);
  const filters: string[] = [];
  filters.push(`fps=${sampleFps.toFixed(4)}`);
  if (crop) filters.push(crop);
  filters.push(`setpts=N/${outputFps}/TB`);
  filters.push(`${scale}:force_original_aspect_ratio=decrease`);
  filters.push(pad);
  const filterStr = filters.join(',');

  console.log(`🎬 FFmpeg.wasm: ${duration}초 → ${outputSeconds}초, filter: ${filterStr}`);

  // FFmpeg 실행
  await ff.exec([
    '-i', inputName,
    '-vf', filterStr,
    '-r', String(outputFps),
    '-an',
    '-c:v', 'libx264',
    '-profile:v', 'high',
    '-level', '4.1',
    '-pix_fmt', 'yuv420p',
    '-crf', '23',
    '-maxrate', '5M',
    '-bufsize', '10M',
    '-preset', 'fast',
    '-movflags', '+faststart',
    outputName,
  ]);

  // 출력 읽기
  const data = await ff.readFile(outputName);
  const blob = new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });

  // 정리
  await ff.deleteFile(inputName);
  await ff.deleteFile(outputName);

  onProgress(100);
  console.log(`✅ 타임랩스 완료: ${(blob.size / 1024 / 1024).toFixed(1)}MB`);

  return blob;
}
