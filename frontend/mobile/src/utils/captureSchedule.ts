import { CAPTURE_TUNING } from '../constants/captureTuning';

/**
 * 현재 elapsed 시점에서 결과 영상 길이(초) 추정.
 * adr-05 sqrt schedule 기반.
 *
 * 누적_캡처(t) = totalFrames × √(t / goalSec)
 * 결과 영상 길이 = 누적_캡처 / outputFps = outputSec × √(t / goalSec)
 */
export function estimateOutputSec(
  recordingSec: number,
  goalSec: number,
  outputSec: number
): number {
  if (goalSec <= 0 || recordingSec <= 0) return 0;
  const ratio = Math.min(1, recordingSec / goalSec);
  const estimated = outputSec * Math.sqrt(ratio);
  return Math.max(CAPTURE_TUNING.minOutputSec, estimated);
}
