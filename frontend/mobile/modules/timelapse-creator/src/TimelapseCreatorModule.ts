import { NativeModule, requireNativeModule } from 'expo';

import { TimelapseCreatorModuleEvents } from './TimelapseCreator.types';

declare class TimelapseCreatorModule extends NativeModule<TimelapseCreatorModuleEvents> {
  createTimelapse(options: {
    photoUris: string[];
    outputPath: string;
    outputSeconds: number;
    width: number;
    height: number;
    frameRate: number;
    bitRate: number;
    mirrorHorizontally: boolean;
    overlayStyle: string;
    overlayText: string;
    streak: number;
  }): Promise<string>;
}

export default requireNativeModule<TimelapseCreatorModule>('TimelapseCreator');
