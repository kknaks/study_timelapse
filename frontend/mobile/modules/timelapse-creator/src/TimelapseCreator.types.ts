export interface TimelapseOptions {
  photoUris: string[];
  outputPath: string;
  outputSeconds: number;
  width: number;
  height: number;
  frameRate: number;
  bitRate: number;
  mirrorHorizontally: boolean;
  overlayStyle: string; // "none"|"timer"|"progress"|"streak"
  overlayText: string;
  streak: number;
  timerMode: string; // "countdown"|"countup"
  recordingSeconds: number;
  goalSeconds: number;
}

export type TimelapseCreatorModuleEvents = {
  onProgress: (params: { progress: number }) => void;
};
