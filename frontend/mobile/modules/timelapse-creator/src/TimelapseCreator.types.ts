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
}

export type TimelapseCreatorModuleEvents = {
  onProgress: (params: { progress: number }) => void;
};
