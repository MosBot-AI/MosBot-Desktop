import { contextBridge } from 'electron';
import type { MosBotBridge } from '../shared/bridge';

/**
 * Narrow renderer bridge. `sandbox: true` keeps this file free of Node APIs
 * beyond the preload-safe `process` snapshot.
 */
const bridge: MosBotBridge = {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
};

contextBridge.exposeInMainWorld('mosbot', bridge);
