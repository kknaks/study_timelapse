import { EventSubscription } from 'expo-modules-core';

import TimelapseCreatorModule from './src/TimelapseCreatorModule';
import { TimelapseOptions, OverlayOptions } from './src/TimelapseCreator.types';

export { TimelapseOptions, OverlayOptions } from './src/TimelapseCreator.types';

export async function createTimelapse(options: TimelapseOptions): Promise<string> {
  return TimelapseCreatorModule.createTimelapse(options);
}

export async function applyOverlay(options: OverlayOptions): Promise<string> {
  return TimelapseCreatorModule.applyOverlay(options);
}

export function addProgressListener(
  listener: (event: { progress: number }) => void
): EventSubscription {
  return TimelapseCreatorModule.addListener('onProgress', listener);
}
