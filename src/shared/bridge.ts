/**
 * The only surface the renderer gets from Electron. M0a deliberately exposes
 * no business data yet: protocol commands arrive with the M0b/M1 bridge and
 * stay narrow, validated per sender and window.
 */
export interface MosBotBridge {
  readonly platform: NodeJS.Platform;
  readonly versions: {
    readonly electron: string;
    readonly chrome: string;
  };
}
