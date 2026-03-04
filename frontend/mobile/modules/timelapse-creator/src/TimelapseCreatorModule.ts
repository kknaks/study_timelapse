import { NativeModule, requireNativeModule } from 'expo';

import { TimelapseCreatorModuleEvents } from './TimelapseCreator.types';

declare class TimelapseCreatorModule extends NativeModule<TimelapseCreatorModuleEvents> {
  createTimelapse(options: {
    videoUri: string;
    outputPath: string;
    outputSeconds: number;
    width: number;
    height: number;
    frameRate: number;
    bitRate: number;
    overlayStyle: string;
    overlayText: string;
    streak: number;
    timerMode: string;
    recordingSeconds: number;
    goalSeconds: number;
  }): Promise<string>;
  applyOverlay(options: {
    videoUri: string;
    outputPath: string;
    overlayStyle: string;
    overlayText: string;
    streak: number;
    recordingSeconds: number;
    goalSeconds: number;
    timerMode: string;
    width: number;
    height: number;
  }): Promise<string>;
}

export default requireNativeModule<TimelapseCreatorModule>('TimelapseCreator');
