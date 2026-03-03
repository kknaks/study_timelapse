import { EventSubscription } from 'expo-modules-core';

import TimelapseCreatorModule from './src/TimelapseCreatorModule';
import { TimelapseOptions } from './src/TimelapseCreator.types';

export { TimelapseOptions } from './src/TimelapseCreator.types';

export async function createTimelapse(options: TimelapseOptions): Promise<string> {
  return TimelapseCreatorModule.createTimelapse(options);
}

export function addProgressListener(
  listener: (event: { progress: number }) => void
): EventSubscription {
  return TimelapseCreatorModule.addListener('onProgress', listener);
}
