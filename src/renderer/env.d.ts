import type { MosBotBridge } from '../shared/bridge';

declare global {
  interface Window {
    readonly mosbot?: MosBotBridge;
    /** Test-only diagnostics: main process appends ?diag=1 only with MOSBOT_DIAG=1. */
    __mosbotDiag?: { state: () => unknown };
    __mosbotViewerDiag?: { dropSocket: () => void };
  }
}

export {};
