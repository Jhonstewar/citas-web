import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/ApiError';
import type { AuthTokensResponse } from '../api/contracts';
import { createSessionManager, type SessionApi } from './sessionManager';

/** Respuesta de login/refresh desde D36: sin `refreshToken` (va en la cookie `HttpOnly`). */
function tokens(n: number): AuthTokensResponse {
  return { accessToken: `access-${n}`, tokenType: 'Bearer', expiresIn: 900 };
}

/** Promesa que resuelve o rechaza cuando la prueba lo decide. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeApi() {
  const api = {
    refresh: vi.fn<() => Promise<AuthTokensResponse>>(),
    logout: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  } satisfies SessionApi;
  return api;
}

const rejected = () => new ApiError('session', 401, 'La sesión no es válida o ha expirado');

describe('sessionManager — renovación', () => {
  it('renueva sin enviar el refresh token (va en la cookie) y deja listo el access token nuevo', async () => {
    const api = fakeApi();
    api.refresh.mockResolvedValueOnce(tokens(2)).mockResolvedValueOnce(tokens(3));
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    await expect(session.refreshSession()).resolves.toBe(true);
    expect(session.getAccessToken()).toBe('access-2');

    // D36: el cliente no conoce el refresh token; cada renovación sale sin argumentos y el
    // navegador adjunta la cookie ya rotada.
    await session.refreshSession();
    expect(session.getAccessToken()).toBe('access-3');
    expect(api.refresh.mock.calls).toEqual([[], []]);
  });

  it('comparte una sola renovación entre las peticiones que fallan a la vez', async () => {
    const api = fakeApi();
    const pending = deferred<AuthTokensResponse>();
    api.refresh.mockReturnValueOnce(pending.promise);
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    const results = [session.refreshSession(), session.refreshSession(), session.refreshSession()];
    pending.resolve(tokens(2));

    expect(await Promise.all(results)).toEqual([true, true, true]);
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('CA-07: si el servidor rechaza el refresh, la sesión termina', async () => {
    const api = fakeApi();
    api.refresh.mockRejectedValueOnce(rejected());
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    await expect(session.refreshSession()).resolves.toBe(false);
    expect(session.getAccessToken()).toBeNull();
    expect(session.getStatus()).toBe('anonymous');
    // El servidor ya invalidó y borró la cookie: no hay nada que revocar.
    expect(api.logout).not.toHaveBeenCalled();
  });

  it('un 5xx durante la renovación no cierra la sesión', async () => {
    const api = fakeApi();
    const failure = new ApiError('server', 503, 'no disponible');
    api.refresh.mockRejectedValueOnce(failure);
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    await expect(session.refreshSession()).rejects.toBe(failure);
    expect(session.getAccessToken()).toBe('access-1');
    expect(api.logout).not.toHaveBeenCalled();
  });

  it('un corte de red durante la renovación no cierra la sesión', async () => {
    const api = fakeApi();
    const outage = new ApiError('network', 0, 'sin red');
    api.refresh.mockRejectedValueOnce(outage).mockResolvedValueOnce(tokens(2));
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    await expect(session.refreshSession()).rejects.toBe(outage);
    expect(session.getAccessToken()).toBe('access-1');
    expect(api.logout).not.toHaveBeenCalled();

    // Al volver la red, la misma cookie sigue sirviendo.
    await expect(session.refreshSession()).resolves.toBe(true);
    expect(api.refresh).toHaveBeenCalledTimes(2);
  });
});

describe('sessionManager — arranque tras recargar (F5, D36)', () => {
  it('empieza "comprobando": sin access token aún no significa "sin sesión"', () => {
    const session = createSessionManager(fakeApi());
    expect(session.getStatus()).toBe('checking');
    expect(session.isAuthenticated()).toBe(false);
  });

  it('con cookie válida, restaura la sesión con el access token renovado', async () => {
    const api = fakeApi();
    api.refresh.mockResolvedValueOnce(tokens(5));
    const session = createSessionManager(api);
    const listener = vi.fn();
    session.subscribe(listener);

    await session.restore();

    expect(session.getStatus()).toBe('authenticated');
    expect(session.getAccessToken()).toBe('access-5');
    expect(session.tokenStatus('access-5')).toBe('current');
    expect(listener).toHaveBeenCalled();
  });

  it('sin cookie (401), queda sin sesión, sin error y sin revocar nada', async () => {
    const api = fakeApi();
    api.refresh.mockRejectedValueOnce(rejected());
    const session = createSessionManager(api);

    await expect(session.restore()).resolves.toBeUndefined();

    expect(session.getStatus()).toBe('anonymous');
    expect(api.logout).not.toHaveBeenCalled();
  });

  it('sin respuesta del servidor (red), deja de comprobar y queda "no disponible", no "sin sesión"', async () => {
    const api = fakeApi();
    const outage = new ApiError('network', 0, 'sin red');
    api.refresh.mockRejectedValueOnce(outage);
    const session = createSessionManager(api);
    const listener = vi.fn();
    session.subscribe(listener);

    await expect(session.restore()).resolves.toBeUndefined();

    expect(session.getStatus()).toBe('unavailable');
    expect(session.isAuthenticated()).toBe(false);
    expect(session.getRestoreFailure()).toBe(outage);
    expect(listener).toHaveBeenCalled();
    expect(api.logout).not.toHaveBeenCalled();
  });

  it('un 5xx en el arranque también deja "no disponible"', async () => {
    const api = fakeApi();
    api.refresh.mockRejectedValueOnce(new ApiError('server', 503, 'no disponible'));
    const session = createSessionManager(api);

    await session.restore();

    expect(session.getStatus()).toBe('unavailable');
    expect(session.getRestoreFailure()?.status).toBe(503);
  });

  it('reintentar tras "no disponible" vuelve a comprobar y restaura si el servidor ya responde', async () => {
    const api = fakeApi();
    const pending = deferred<AuthTokensResponse>();
    api.refresh
      .mockRejectedValueOnce(new ApiError('server', 503, 'no disponible'))
      .mockReturnValueOnce(pending.promise);
    const session = createSessionManager(api);
    await session.restore();

    const retrying = session.retryRestore();
    expect(session.getStatus()).toBe('checking');
    expect(session.getRestoreFailure()).toBeNull();
    pending.resolve(tokens(4));
    await retrying;

    expect(session.getStatus()).toBe('authenticated');
    expect(session.getAccessToken()).toBe('access-4');
    expect(api.refresh).toHaveBeenCalledTimes(2);
  });

  it('reintentar tras "no disponible" con un 401 deja sin sesión', async () => {
    const api = fakeApi();
    api.refresh.mockRejectedValueOnce(new ApiError('network', 0, 'sin red')).mockRejectedValueOnce(rejected());
    const session = createSessionManager(api);
    await session.restore();

    await session.retryRestore();

    expect(session.getStatus()).toBe('anonymous');
    expect(session.getRestoreFailure()).toBeNull();
  });

  it('reintentar sin estar "no disponible" no pide otra renovación', async () => {
    const api = fakeApi();
    api.refresh.mockRejectedValueOnce(rejected());
    const session = createSessionManager(api);
    await session.restore();

    await session.retryRestore();

    expect(session.getStatus()).toBe('anonymous');
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('un login desde "no disponible" abre la sesión y borra el error del arranque', async () => {
    const api = fakeApi();
    api.refresh.mockRejectedValueOnce(new ApiError('network', 0, 'sin red'));
    const session = createSessionManager(api);
    await session.restore();

    session.signIn(tokens(8));

    expect(session.getStatus()).toBe('authenticated');
    expect(session.getRestoreFailure()).toBeNull();
    session.signOut();
    expect(session.getStatus()).toBe('anonymous');
  });

  it('es idempotente: varias llamadas (doble montaje de StrictMode) hacen una sola renovación', async () => {
    const api = fakeApi();
    const pending = deferred<AuthTokensResponse>();
    api.refresh.mockReturnValueOnce(pending.promise);
    const session = createSessionManager(api);

    const first = session.restore();
    const second = session.restore();
    // Un 401 de la API que llegue durante el arranque se suma a la misma renovación.
    const fromApi = session.refreshSession();
    pending.resolve(tokens(2));
    await Promise.all([first, second, fromApi]);

    expect(api.refresh).toHaveBeenCalledTimes(1);
    expect(session.getAccessToken()).toBe('access-2');
    await session.restore();
    expect(api.refresh).toHaveBeenCalledTimes(1);
  });

  it('un login durante el arranque gana: la restauración tardía no lo pisa', async () => {
    const api = fakeApi();
    const pending = deferred<AuthTokensResponse>();
    api.refresh.mockReturnValueOnce(pending.promise);
    const session = createSessionManager(api);

    const restoring = session.restore();
    session.signIn(tokens(9));
    pending.resolve(tokens(2));
    await restoring;

    expect(session.getAccessToken()).toBe('access-9');
    expect(session.getStatus()).toBe('authenticated');
  });

  it('el rechazo tardío del arranque no cierra un login hecho mientras tanto', async () => {
    const api = fakeApi();
    const pending = deferred<AuthTokensResponse>();
    api.refresh.mockReturnValueOnce(pending.promise);
    const session = createSessionManager(api);

    const restoring = session.restore();
    session.signIn(tokens(9));
    pending.reject(rejected());
    await restoring;

    expect(session.getAccessToken()).toBe('access-9');
  });

  it('tras un login o logout ya no hay nada que restaurar', async () => {
    const api = fakeApi();
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    await session.restore();

    expect(api.refresh).not.toHaveBeenCalled();
    expect(session.getAccessToken()).toBe('access-1');
  });
});

describe('sessionManager — logout', () => {
  it('revoca en el servidor sin cuerpo y cierra la sesión local', () => {
    const api = fakeApi();
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    session.signOut();

    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(api.logout).toHaveBeenCalledWith();
    expect(session.getStatus()).toBe('anonymous');
  });

  it('limpia la sesión local aunque la revocación falle por red', async () => {
    const api = fakeApi();
    api.logout.mockRejectedValueOnce(new ApiError('network', 0, 'sin red'));
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    session.signOut();
    // El rechazo se absorbe: no hay promesa sin `catch` ni sesión que sobreviva.
    await Promise.resolve();

    expect(session.getAccessToken()).toBeNull();
    expect(session.getStatus()).toBe('anonymous');
  });
});

describe('sessionManager — carreras con el logout', () => {
  it('un logout durante la renovación no se deshace cuando la renovación responde', async () => {
    const api = fakeApi();
    const pending = deferred<AuthTokensResponse>();
    api.refresh.mockReturnValueOnce(pending.promise);
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    const renewal = session.refreshSession();
    session.signOut();
    pending.resolve(tokens(2));

    await expect(renewal).resolves.toBe(false);
    expect(session.getAccessToken()).toBeNull();
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it('la renovación de una sesión cerrada no pisa la sesión nueva', async () => {
    const api = fakeApi();
    const pending = deferred<AuthTokensResponse>();
    api.refresh.mockReturnValueOnce(pending.promise);
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    const renewal = session.refreshSession();
    session.signOut();
    session.signIn(tokens(9));
    pending.resolve(tokens(2));

    await expect(renewal).resolves.toBe(false);
    expect(session.getAccessToken()).toBe('access-9');
  });

  it('el rechazo tardío de una sesión cerrada no cierra ni revoca la sesión nueva', async () => {
    const api = fakeApi();
    const pending = deferred<AuthTokensResponse>();
    api.refresh.mockReturnValueOnce(pending.promise);
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    const renewal = session.refreshSession();
    session.signOut();
    session.signIn(tokens(9));
    pending.reject(rejected());

    await expect(renewal).resolves.toBe(false);
    expect(session.getAccessToken()).toBe('access-9');
    // Solo el logout explícito de la sesión 1; el rechazo tardío no revoca la 9.
    expect(api.logout).toHaveBeenCalledTimes(1);
  });

  it('una sesión nueva no se suma a la renovación pendiente de la anterior', async () => {
    const api = fakeApi();
    const stale = deferred<AuthTokensResponse>();
    api.refresh.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(tokens(10));
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    void session.refreshSession();
    session.signIn(tokens(9));

    await expect(session.refreshSession()).resolves.toBe(true);
    expect(api.refresh).toHaveBeenCalledTimes(2);
    expect(session.getAccessToken()).toBe('access-10');
    stale.resolve(tokens(2));
  });
});

describe('sessionManager — tokenStatus', () => {
  it('distingue el token actual, uno ya renovado de esta sesión y uno de una sesión cerrada', async () => {
    const api = fakeApi();
    api.refresh.mockResolvedValueOnce(tokens(2));
    const session = createSessionManager(api);
    session.signIn(tokens(1));
    await session.refreshSession();

    expect(session.tokenStatus('access-2')).toBe('current');
    expect(session.tokenStatus('access-1')).toBe('renewed');

    session.signOut();
    session.signIn(tokens(9));

    expect(session.tokenStatus('access-9')).toBe('current');
    expect(session.tokenStatus('access-1')).toBe('foreign');
    expect(session.tokenStatus('access-2')).toBe('foreign');
  });

  it('sin sesión, cualquier token es de una sesión cerrada', () => {
    const session = createSessionManager(fakeApi());
    session.signIn(tokens(1));
    session.signOut();

    expect(session.isAuthenticated()).toBe(false);
    expect(session.tokenStatus('access-1')).toBe('foreign');
  });
});

describe('sessionManager — expire', () => {
  it('cierra la sesión si el token rechazado es el vigente', () => {
    const api = fakeApi();
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    session.expire('access-1');

    expect(session.getAccessToken()).toBeNull();
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(api.logout).toHaveBeenCalledWith();
  });

  it('ignora el 401 tardío de un token que ya no es el vigente', () => {
    const api = fakeApi();
    const session = createSessionManager(api);
    session.signIn(tokens(9));

    session.expire('access-1');

    expect(session.getAccessToken()).toBe('access-9');
    expect(api.logout).not.toHaveBeenCalled();
  });

  it('avisa a los suscriptores de cada cambio de sesión', () => {
    const session = createSessionManager(fakeApi());
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);

    session.signIn(tokens(1));
    session.signOut();
    unsubscribe();
    session.signIn(tokens(2));

    expect(listener).toHaveBeenCalledTimes(2);
  });
});
