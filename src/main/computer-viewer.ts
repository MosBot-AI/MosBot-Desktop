import { createHash } from 'node:crypto';
import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron';
import { DASHBOARD_CHANNELS } from '../shared/bridge';
import {
  protocolError,
  type ComputerBootstrap,
  type DisplayLease,
  type Result,
} from '../shared/protocol';
import type { AuthManager } from './dashboard/auth';
import { connectGateway, type RpcClient } from './dashboard/rpc';
import { emptySchema } from './dashboard/schemas';
import type { TransportFetch } from './dashboard/transport';

export interface ComputerViewerDeps {
  readonly auth: AuthManager;
  readonly fetchImpl: TransportFetch;
  readonly preloadPath: string;
  readonly rendererDevUrl: string | null;
  readonly rendererIndex: string;
  readonly getParent: () => BrowserWindow | null;
  readonly isTrustedEvent: (event: IpcMainInvokeEvent) => boolean;
}

export interface ComputerViewer {
  open(profile: string): Promise<Result<void>>;
  dispose(): void;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function viewerHash(viewerId: string): string {
  return createHash('sha256').update(viewerId).digest('hex').slice(0, 12);
}

function mapLease(value: unknown, ownHash: string): DisplayLease | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  return {
    holder: str(record['holder']),
    since: typeof record['since'] === 'number' ? record['since'] : null,
    viewerHash: str(record['viewer_hash']) || null,
    reason: str(record['reason']),
    mine:
      str(record['holder']) === 'human' && ownHash !== '' && str(record['viewer_hash']) === ownHash,
  };
}

/**
 * The independent remote-computer window. It owns one gateway connection for the
 * display lease and hands the viewer renderer a single-use RFB ticket. Closing the
 * window releases control and drops the connection; a second open focuses the
 * existing window instead of minting another viewer identity.
 */
export function createComputerViewer(deps: ComputerViewerDeps): ComputerViewer {
  let window: BrowserWindow | null = null;
  let client: RpcClient | null = null;
  let viewerId = '';
  let leaseHeld = false;

  const sendLease = (lease: DisplayLease | null): void => {
    window?.webContents.send(DASHBOARD_CHANNELS.computerLease, lease);
  };

  const releaseIfHeld = (): void => {
    if (!leaseHeld || client === null || viewerId === '') {
      return;
    }
    leaseHeld = false;
    void client.call('display.lease.release', { viewer_id: viewerId }, emptySchema);
  };

  const teardown = (): void => {
    releaseIfHeld();
    client?.close();
    client = null;
    window = null;
    viewerId = '';
  };

  const createWindow = async (observed: {
    ticket: string;
    viewerId: string;
    profile: string;
  }): Promise<Result<void>> => {
    const parent = deps.getParent();
    const viewer = new BrowserWindow({
      width: 980,
      height: 660,
      minWidth: 640,
      minHeight: 420,
      title: `${observed.profile} · 电脑`,
      backgroundColor: '#101014',
      ...(parent === null ? {} : { parent }),
      show: false,
      webPreferences: {
        preload: deps.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
        webviewTag: false,
        webSecurity: true,
      },
    });
    window = viewer;
    const wsBase = (() => {
      const target = deps.auth.target();
      if (target === null) {
        return '';
      }
      const url = new URL(target.origin);
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const prefix = target.basePath === '/' ? '' : target.basePath.replace(/\/$/, '');
      return `${url.origin}${prefix}`;
    })();
    const wsUrl = `${wsBase}/api/display/ws?display_ticket=${encodeURIComponent(observed.ticket)}`;
    const bootstrap: ComputerBootstrap = {
      wsUrl,
      viewerId: observed.viewerId,
      profile: observed.profile,
      botName: observed.profile,
    };
    viewer.webContents.on('did-finish-load', () => {
      viewer.webContents.send(DASHBOARD_CHANNELS.computerBootstrap, bootstrap);
      viewer.show();
    });
    viewer.on('closed', () => {
      teardown();
    });
    if (deps.rendererDevUrl !== null) {
      void viewer.loadURL(`${deps.rendererDevUrl}?viewer=1`);
    } else {
      void viewer.loadFile(deps.rendererIndex, { query: { viewer: '1' } });
    }
    return { ok: true, data: undefined };
  };

  ipcMain.handle(DASHBOARD_CHANNELS.openComputerViewer, async (event, rawProfile: unknown) => {
    if (!deps.isTrustedEvent(event) || typeof rawProfile !== 'string' || rawProfile === '') {
      return { ok: false, error: protocolError('internal', 'Untrusted renderer request.') };
    }
    return open(rawProfile);
  });

  ipcMain.handle(DASHBOARD_CHANNELS.computerAcquire, async (event): Promise<Result<void>> => {
    if (!deps.isTrustedEvent(event) || client === null || viewerId === '') {
      return { ok: false, error: protocolError('internal', 'The viewer is not ready.') };
    }
    const acquired = await client.call(
      'display.lease.acquire',
      { viewer_id: viewerId, reason: 'mosbot-desktop' },
      emptySchema,
    );
    if (!acquired.ok) {
      return acquired;
    }
    leaseHeld = true;
    sendLease(mapLease(asRecord(acquired.data)?.['lease'], viewerHash(viewerId)));
    return { ok: true, data: undefined };
  });

  ipcMain.handle(DASHBOARD_CHANNELS.computerRelease, async (event): Promise<Result<void>> => {
    if (!deps.isTrustedEvent(event) || client === null || viewerId === '') {
      return { ok: false, error: protocolError('internal', 'The viewer is not ready.') };
    }
    const released = await client.call(
      'display.lease.release',
      { viewer_id: viewerId },
      emptySchema,
    );
    if (!released.ok) {
      return released;
    }
    leaseHeld = false;
    sendLease(mapLease(asRecord(released.data)?.['lease'], viewerHash(viewerId)));
    return { ok: true, data: undefined };
  });

  ipcMain.handle(DASHBOARD_CHANNELS.computerClose, (event): void => {
    if (!deps.isTrustedEvent(event)) {
      return;
    }
    window?.close();
  });

  const open = async (profileName: string): Promise<Result<void>> => {
    if (window !== null && !window.isDestroyed()) {
      window.focus();
      return { ok: true, data: undefined };
    }
    const target = deps.auth.current().connected ? deps.auth.target() : null;
    if (target === null) {
      return {
        ok: false,
        error: protocolError('unauthorized', 'Sign in to the Dashboard first.'),
      };
    }
    const connection = await connectGateway({
      fetchImpl: deps.fetchImpl,
      target,
      getAccessToken: () => deps.auth.accessToken(),
      requestTimeoutMs: 20_000,
      onEvent: (type, params) => {
        if (type !== 'display.lease') {
          return;
        }
        const payload = asRecord(params['payload']);
        const lease = mapLease(payload?.['lease'], viewerHash(viewerId));
        if (lease !== null) {
          leaseHeld = lease.holder === 'human' && lease.viewerHash === viewerHash(viewerId);
          sendLease(lease);
        }
      },
    });
    if (!connection.ok) {
      return connection;
    }
    client = connection.data;
    const observed = await client.call('display.observe', { profile: profileName }, emptySchema);
    if (!observed.ok) {
      client.close();
      client = null;
      return observed;
    }
    const record = asRecord(observed.data);
    const ticket = str(record?.['ticket']);
    const mintedViewerId = str(record?.['viewer_id']);
    if (ticket === '' || mintedViewerId === '') {
      client.close();
      client = null;
      return {
        ok: false,
        error: protocolError('malformed_response', 'The Dashboard returned no display ticket.'),
      };
    }
    viewerId = mintedViewerId;
    return createWindow({ ticket, viewerId: mintedViewerId, profile: profileName });
  };

  return {
    open,
    dispose() {
      window?.close();
      teardown();
    },
  };
}
