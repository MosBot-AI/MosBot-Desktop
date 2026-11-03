import { useCallback } from 'react';
import type { MosBotDashboardBridge } from '../../../shared/bridge';
import { TEST_DASHBOARD_URL } from '../../../shared/protocol';
import {
  appStore,
  useAppState,
  useDispatch,
  type AppAction,
  type ConnectionUiState,
} from '../../app/store';

type Dispatch = (action: AppAction) => void;

function bridge(): MosBotDashboardBridge | null {
  return window.mosbot?.dashboard ?? null;
}

async function loginWithProvider(dispatch: Dispatch, provider?: string): Promise<void> {
  const dashboard = bridge();
  if (dashboard === null) {
    return;
  }
  const address = appStore.getState().connectionUi.address.trim();
  dispatch({ type: 'connection-stage', stage: 'awaiting-browser' });
  dispatch({ type: 'connection-error', error: null });
  const result = await dashboard.login(address, provider);
  if (result.ok) {
    dispatch({ type: 'connection-snapshot', snapshot: result.data });
    void dashboard.saveAddress(address);
    return;
  }
  dispatch({ type: 'connection-error', error: result.error });
  dispatch({ type: 'connection-stage', stage: 'idle' });
}

export interface ConnectionActions {
  readonly ui: ConnectionUiState;
  connect(): Promise<void>;
  chooseProvider(provider: string): Promise<void>;
  cancel(): Promise<void>;
  signOut(): Promise<void>;
  close(): void;
  updateAddress(address: string): void;
  defaultAddress: string;
}

/**
 * The first-connection flow: preflight the address, pick a provider when the
 * deployment offers several, then hand off to the system browser. The refresh
 * token is persisted by the main process, so the next launch restores silently.
 */
export function useConnectionActions(): ConnectionActions {
  const dispatch = useDispatch();
  const ui = useAppState((state) => state.connectionUi);

  const connect = useCallback(async () => {
    const dashboard = bridge();
    if (dashboard === null) {
      dispatch({
        type: 'connection-error',
        error: { code: 'internal', message: 'Bridge unavailable', retriable: false },
      });
      return;
    }
    const address = appStore.getState().connectionUi.address.trim();
    dispatch({ type: 'connection-error', error: null });
    dispatch({ type: 'connection-stage', stage: 'checking' });
    const preflight = await dashboard.preflight(address);
    if (!preflight.ok) {
      dispatch({ type: 'connection-error', error: preflight.error });
      dispatch({ type: 'connection-stage', stage: 'idle' });
      return;
    }
    dispatch({ type: 'connection-providers', providers: preflight.data.providers });
    if (preflight.data.providers.length > 1) {
      dispatch({ type: 'connection-stage', stage: 'choose-provider' });
      return;
    }
    await loginWithProvider(dispatch, preflight.data.providers[0]?.name);
  }, [dispatch]);

  const chooseProvider = useCallback(
    async (provider: string) => {
      await loginWithProvider(dispatch, provider);
    },
    [dispatch],
  );

  const cancel = useCallback(async () => {
    await bridge()?.cancelLogin();
    dispatch({ type: 'connection-error', error: null });
    dispatch({ type: 'connection-stage', stage: 'idle' });
  }, [dispatch]);

  const signOut = useCallback(async () => {
    await bridge()?.signOut();
    dispatch({ type: 'connection-snapshot', snapshot: null });
  }, [dispatch]);

  const close = useCallback(() => {
    dispatch({ type: 'connection-close' });
  }, [dispatch]);

  const updateAddress = useCallback(
    (address: string) => {
      dispatch({ type: 'connection-address', address });
    },
    [dispatch],
  );

  return {
    ui,
    connect,
    chooseProvider,
    cancel,
    signOut,
    close,
    updateAddress,
    defaultAddress: TEST_DASHBOARD_URL,
  };
}

/**
 * Startup restore: remember the last address, then silently reuse the saved
 * refresh token so nobody retypes the password.
 */
export async function restoreConnectionOnStartup(dispatch: Dispatch): Promise<void> {
  const dashboard = bridge();
  if (dashboard === null) {
    return;
  }
  const settings = await dashboard.settings();
  if (!settings.ok || settings.data.lastAddress === null) {
    return;
  }
  dispatch({ type: 'connection-address', address: settings.data.lastAddress });
  const restored = await dashboard.restore(settings.data.lastAddress);
  if (restored.ok && restored.data.connected) {
    dispatch({ type: 'connection-snapshot', snapshot: restored.data });
  }
}
