import { createServer, type Server } from 'node:http';
import { protocolError, type Result } from '../../shared/protocol';

export interface LoopbackCallbackPayload {
  readonly code: string;
  readonly state: string;
}

export interface LoopbackReceiver {
  readonly redirectUri: string;
  /** Resolves with the code/state pair, or fails with auth_cancelled/timeout. */
  readonly result: Promise<Result<LoopbackCallbackPayload>>;
  close(): void;
}

const DEFAULT_TIMEOUT_MS = 5 * 60_000;

const SUCCESS_PAGE = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">
<title>MosBot</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:#fbfaf8;color:#1d1c19;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
main{text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#6b675f;font-size:14px;margin:0}
</style></head><body><main><h1>已回到 MosBot</h1><p>登录结果已交给应用，可以关闭这个页面。</p></main></body></html>`;

const FAILURE_PAGE = `<!doctype html><html lang="zh-Hans"><head><meta charset="utf-8">
<title>MosBot</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;background:#fbfaf8;color:#1d1c19;
display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
main{text-align:center}h1{font-size:20px;margin:0 0 8px}p{color:#6b675f;font-size:14px;margin:0}
</style></head><body><main><h1>登录没有完成</h1><p>请回到 MosBot 重新尝试。</p></main></body></html>`;

/**
 * RFC 8252 loopback receiver: binds an ephemeral port on 127.0.0.1, accepts the
 * single `/callback` redirect, verifies the state and hands the code back to the
 * app. The code is never logged; the server closes on callback, timeout or cancel.
 */
export async function startLoopbackReceiver(options: {
  readonly expectedState: string;
  readonly timeoutMs?: number;
  readonly host?: '127.0.0.1';
}): Promise<Result<LoopbackReceiver>> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const expectedState = options.expectedState;

  let settled = false;
  let resolveResult: (result: Result<LoopbackCallbackPayload>) => void = () => undefined;
  let timer: NodeJS.Timeout | null = null;
  let server: Server | null = null;

  const result = new Promise<Result<LoopbackCallbackPayload>>((resolve) => {
    resolveResult = resolve;
  });

  const finish = (value: Result<LoopbackCallbackPayload>): void => {
    if (settled) {
      return;
    }
    settled = true;
    if (timer !== null) {
      clearTimeout(timer);
    }
    resolveResult(value);
    server?.close();
  };

  server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const respond = (status: number, body: string): void => {
      response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
      response.end(body);
    };
    if (url.pathname !== '/callback') {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('Not found');
      return;
    }
    const error = url.searchParams.get('error');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');

    if (error !== null && error !== '') {
      respond(400, FAILURE_PAGE);
      finish({
        ok: false,
        error: protocolError('auth_cancelled', 'Sign-in was cancelled in the browser.'),
      });
      return;
    }
    if (code === null || code === '' || state === null || state === '') {
      respond(400, FAILURE_PAGE);
      finish({
        ok: false,
        error: protocolError('malformed_response', 'The sign-in callback was incomplete.'),
      });
      return;
    }
    if (state !== expectedState) {
      respond(400, FAILURE_PAGE);
      finish({
        ok: false,
        error: protocolError('malformed_response', 'The sign-in callback state did not match.'),
      });
      return;
    }
    respond(200, SUCCESS_PAGE);
    finish({ ok: true, data: { code, state } });
  });

  const listenError = await new Promise<Error | null>((resolve) => {
    server?.once('error', (error: Error) => {
      resolve(error);
    });
    server?.listen(0, options.host ?? '127.0.0.1', () => {
      resolve(null);
    });
  });

  if (listenError !== null) {
    finish({
      ok: false,
      error: protocolError(
        'internal',
        `Could not open the local sign-in port: ${listenError.message}`,
      ),
    });
    return {
      ok: false,
      error: protocolError('internal', 'Could not open the local sign-in port.'),
    };
  }

  timer = setTimeout(() => {
    finish({
      ok: false,
      error: protocolError('auth_cancelled', 'Sign-in timed out. Try connecting again.'),
    });
  }, timeoutMs);
  timer.unref?.();

  const address = server.address();
  if (address === null || typeof address === 'string') {
    finish({
      ok: false,
      error: protocolError('internal', 'The local sign-in port could not be determined.'),
    });
    return {
      ok: false,
      error: protocolError('internal', 'The local sign-in port could not be determined.'),
    };
  }

  return {
    ok: true,
    data: {
      redirectUri: `http://127.0.0.1:${address.port}/callback`,
      result,
      close: () => {
        finish({
          ok: false,
          error: protocolError('auth_cancelled', 'Sign-in was cancelled.'),
        });
      },
    },
  };
}
