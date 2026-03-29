export interface TimelapseOptions {
  videoUri: string;
  outputPath: string;
  outputSeconds: number;
  width: number;
  height: number;
  frameRate: number;
  bitRate: number;
  overlayStyle: string; // "none"|"timer"|"progress"|"streak"
  overlayText: string;
  streak: number;
  timerMode: string; // "countdown"|"countup"
  recordingSeconds: number;
  goalSeconds: number;
  cameraFacing?: string; // "front"|"back"
  debugStep?: number; // 0=순수export, 1=videoComposition, 2=transform, 3=crop(기본)
}

export interface OverlayOptions {
  videoUri: string;
  outputPath: string;
  overlayStyle: string; // "none"|"timer"|"progress"|"streak"
  overlayText: string;
  streak: number;
  recordingSeconds: number;
  goalSeconds: number;
  timerMode: string; // "countdown"|"countup"
  width: number;
  height: number;
  logoPath?: string; // 로고 이미지 로컬 파일 경로
  overlayLayoutJson?: string; // JSON.stringify(ScaledOverlayLayout) — Swift에 전달할 px 스케일 변환된 레이아웃
}

export type TimelapseCreatorModuleEvents = {
  onProgress: (params: { progress: number }) => void;
  onDebugLog: (params: { log: string }) => void;
};
