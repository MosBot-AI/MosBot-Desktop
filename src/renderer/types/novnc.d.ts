declare module '@novnc/novnc/lib/rfb' {
  export interface RFBOptions {
    readonly shared?: boolean;
    readonly credentials?: { readonly username?: string; readonly password?: string };
    readonly wsProtocols?: readonly string[];
  }

  export default class RFB {
    constructor(target: HTMLElement, url: string, options?: RFBOptions);
    viewOnly: boolean;
    scaleViewport: boolean;
    resizeSession: boolean;
    clipViewport: boolean;
    focus(): void;
    blur(): void;
    disconnect(): void;
    addEventListener(type: string, listener: (event: Event) => void): void;
    removeEventListener(type: string, listener: (event: Event) => void): void;
  }
}
