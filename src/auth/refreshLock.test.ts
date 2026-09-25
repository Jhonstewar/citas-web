import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/ApiError';
import { REFRESH_LOCK_NAME, REFRESH_LOCK_TIMEOUT_MS, withRefreshLock } from './refreshLock';

/**
 * Candado de renovación entre pestañas (D36). jsdom no trae Web Locks: se simula un
 * `LockManager` mínimo que serializa por nombre, como hace el navegador entre pestañas.
 */

type Callback = () => Promise<unknown>;

function fakeLocks() {
  let tail: Promise<unknown> = Promise.resolve();
  const request = vi.fn(
    (_name: string, options: { signal?: AbortSignal }, callback: Callback): Promise<unknown> => {
      const run = tail.then(() => {
        if (options.signal?.aborted === true) throw new DOMException('abortado', 'AbortError');
        return callback();
      });
      tail = run.catch(() => undefined);
      return run;
    },
  );
  return { request };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('withRefreshLock', () => {
  it('serializa renovaciones concurrentes (dos pestañas) con el candado "fcv-refresh"', async () => {
    const locks = fakeLocks();
    vi.stubGlobal('navigator', { locks });
    const first = deferred<string>();
    const order: string[] = [];

    const tabA = withRefreshLock(async () => {
      order.push('A empieza');
      const value = await first.promise;
      order.push('A termina');
      return value;
    });
    const tabB = withRefreshLock(async () => {
      order.push('B empieza');
      return 'B';
    });

    await Promise.resolve();
    await Promise.resolve();
    // B no arranca mientras A tiene el candado: no presentan a la vez la misma cookie.
    expect(order).toEqual(['A empieza']);
    first.resolve('A');

    await expect(Promise.all([tabA, tabB])).resolves.toEqual(['A', 'B']);
    expect(order).toEqual(['A empieza', 'A termina', 'B empieza']);
    expect(locks.request.mock.calls.every(([name]) => name === REFRESH_LOCK_NAME)).toBe(true);
  });

  it('propaga tal cual el error de la renovación (p. ej. el 401 del servidor)', async () => {
    vi.stubGlobal('navigator', { locks: fakeLocks() });
    const rejection = new ApiError('session', 401, 'La sesión no es válida o ha expirado');

    await expect(withRefreshLock(() => Promise.reject(rejection))).rejects.toBe(rejection);
  });

  it('si no consigue el candado a tiempo, lo trata como "sin respuesta" y no renueva', async () => {
    vi.useFakeTimers();
    // Un LockManager cuyo candado nunca se libera: solo responde al aborto de la espera.
    const request = vi.fn(
      (_name: string, options: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => {
            reject(new DOMException('abortado', 'AbortError'));
          });
        }),
    );
    vi.stubGlobal('navigator', { locks: { request } });
    const operation = vi.fn(async () => 'nunca');

    const result = withRefreshLock(operation);
    const assertion = expect(result).rejects.toMatchObject({ kind: 'network' });
    await vi.advanceTimersByTimeAsync(REFRESH_LOCK_TIMEOUT_MS);
    await assertion;
    expect(operation).not.toHaveBeenCalled();
  });

  it('sin Web Locks (navegador antiguo) ejecuta la renovación directamente', async () => {
    vi.stubGlobal('navigator', {});
    await expect(withRefreshLock(async () => 'ok')).resolves.toBe('ok');
  });
});
