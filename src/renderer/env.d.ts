import type { MosBotBridge } from '../shared/bridge';

declare global {
  interface Window {
    readonly mosbot?: MosBotBridge;
  }
}

export {};
