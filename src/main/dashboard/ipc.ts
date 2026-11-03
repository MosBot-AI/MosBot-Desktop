import type { IpcMain, IpcMainInvokeEvent, WebContents } from 'electron';
import { DASHBOARD_CHANNELS } from '../../shared/bridge';
import {
  protocolError,
  type ConnectionSnapshot,
  type DashboardSettings,
  type DashboardStatus,
  type PreflightResult,
  type ProbeReport,
  type RemoteBot,
  type RemoteChat,
  type Result,
} from '../../shared/protocol';
import type { DashboardService } from './service';

const MAX_ADDRESS_LENGTH = 2048;
const MAX_PROVIDER_LENGTH = 64;

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

/**
 * Wires the dashboard bridge to the main process. Every call is only accepted
 * from the app's own top-level frame, so a compromised renderer or an injected
 * iframe cannot start sign-ins or read connection state.
 */
export function registerDashboardIpc(options: {
  readonly ipcMain: IpcMain;
  readonly service: DashboardService;
  readonly isTrustedEvent: (event: IpcMainInvokeEvent) => boolean;
}): void {
  const { ipcMain, service, isTrustedEvent } = options;

  const handle = <T>(
    channel: string,
    handler: (...args: unknown[]) => Promise<Result<T>> | Result<T>,
  ): void => {
    ipcMain.handle(channel, async (event, ...args: unknown[]): Promise<Result<T>> => {
      if (!isTrustedEvent(event)) {
        return { ok: false, error: protocolError('internal', 'Untrusted renderer request.') };
      }
      try {
        return await handler(...args);
      } catch {
        return {
          ok: false,
          error: protocolError('internal', 'The Dashboard request failed unexpectedly.'),
        };
      }
    });
  };

  handle<PreflightResult>(DASHBOARD_CHANNELS.preflight, (address) => {
    if (!isBoundedString(address, MAX_ADDRESS_LENGTH)) {
      return {
        ok: false,
        error: protocolError('invalid_url', 'Enter the Dashboard address.'),
      };
    }
    return service.preflight(address);
  });

  handle<ConnectionSnapshot>(DASHBOARD_CHANNELS.login, (address, provider) => {
    if (!isBoundedString(address, MAX_ADDRESS_LENGTH)) {
      return {
        ok: false,
        error: protocolError('invalid_url', 'Enter the Dashboard address.'),
      };
    }
    if (provider !== undefined && !isBoundedString(provider, MAX_PROVIDER_LENGTH)) {
      return {
        ok: false,
        error: protocolError('auth_unavailable', 'Unknown sign-in provider.'),
      };
    }
    return service.login(address, typeof provider === 'string' ? provider : undefined);
  });

  handle<ConnectionSnapshot>(DASHBOARD_CHANNELS.restore, (address) => {
    if (!isBoundedString(address, MAX_ADDRESS_LENGTH)) {
      return {
        ok: false,
        error: protocolError('invalid_url', 'Enter the Dashboard address.'),
      };
    }
    return service.restore(address);
  });

  handle<ProbeReport>(DASHBOARD_CHANNELS.probe, () => service.probe());
  handle<ProbeReport>(DASHBOARD_CHANNELS.probeWebSocket, () => service.probeWebSocket());
  handle<ProbeReport>(DASHBOARD_CHANNELS.probeWorkbench, () => service.probeWorkbench());
  handle<ProbeReport>(DASHBOARD_CHANNELS.probeNewBot, () => service.probeNewBot());
  handle<ProbeReport>(DASHBOARD_CHANNELS.probeKanbanWrite, () => service.probeKanbanWrite());
  handle<ProbeReport>(DASHBOARD_CHANNELS.signOut, () => service.signOut());
  handle<DashboardStatus>(DASHBOARD_CHANNELS.status, () => service.status());
  handle<void>(DASHBOARD_CHANNELS.cancelLogin, () => service.cancelLogin());
  handle<readonly RemoteBot[]>(DASHBOARD_CHANNELS.listBots, () => service.listBots());
  handle<RemoteChat>(DASHBOARD_CHANNELS.openChat, (profileName) => {
    if (!isBoundedString(profileName, 128)) {
      return {
        ok: false,
        error: protocolError('invalid_url', 'A profile name is required to open a chat.'),
      };
    }
    return service.openChat(profileName);
  });
  handle<DashboardSettings>(DASHBOARD_CHANNELS.settings, () => service.settings());
  handle<void>(DASHBOARD_CHANNELS.saveAddress, (address) => {
    if (address !== null && !isBoundedString(address, MAX_ADDRESS_LENGTH)) {
      return {
        ok: false,
        error: protocolError('invalid_url', 'Enter the Dashboard address.'),
      };
    }
    return service.saveAddress(typeof address === 'string' ? address : null);
  });
}

/** Only the app's own main frame may call the bridge. */
export function createTrustedSenderCheck(
  getMainContents: () => WebContents | null,
): (event: IpcMainInvokeEvent) => boolean {
  return (event) => {
    const contents = getMainContents();
    if (contents === null || event.sender.id !== contents.id) {
      return false;
    }
    return event.senderFrame === contents.mainFrame;
  };
}
