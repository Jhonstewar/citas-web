import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/ApiError';
import type { AuthTokensResponse, RefreshRequest } from '../api/contracts';
import { createSessionManager, type SessionApi } from './sessionManager';

function tokens(n: number): AuthTokensResponse {
  return { accessToken: `access-${n}`, refreshToken: `refresh-${n}`, tokenType: 'Bearer', expiresIn: 900 };
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
    refresh: vi.fn<(payload: RefreshRequest) => Promise<AuthTokensResponse>>(),
    logout: vi.fn<(payload: RefreshRequest) => Promise<void>>().mockResolvedValue(undefined),
  } satisfies SessionApi;
  return api;
}

describe('sessionManager — renovación', () => {
  it('renueva con el refresh token vigente y deja listo el access token nuevo', async () => {
    const api = fakeApi();
    api.refresh.mockResolvedValueOnce(tokens(2)).mockResolvedValueOnce(tokens(3));
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    await expect(session.refreshSession()).resolves.toBe(true);
    expect(session.getAccessToken()).toBe('access-2');

    // La segunda renovación presenta el token ya rotado, no el del login.
    await session.refreshSession();
    expect(api.refresh.mock.calls.map(([payload]) => payload.refreshToken)).toEqual([
      'refresh-1',
      'refresh-2',
    ]);
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
    api.refresh.mockRejectedValueOnce(new ApiError('session', 401, 'no autorizado'));
    const session = createSessionManager(api);
    session.signIn(tokens(1));

    await expect(session.refreshSession()).resolves.toBe(false);
    expect(session.getAccessToken()).toBeNull();
    // El token rechazado ya no sirve en el servidor: no hay nada que revocar.
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

    // Al volver la red, el mismo refresh token sigue sirviendo.
    await expect(session.refreshSession()).resolves.toBe(true);
    expect(api.refresh).toHaveBeenLastCalledWith({ refreshToken: 'refresh-1' });
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
    expect(api.logout).toHaveBeenCalledWith({ refreshToken: 'refresh-1' });
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
    pending.reject(new ApiError('session', 401, 'revocado'));

    await expect(renewal).resolves.toBe(false);
    expect(session.getAccessToken()).toBe('access-9');
    expect(api.logout).not.toHaveBeenCalledWith({ refreshToken: 'refresh-9' });
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
    expect(api.refresh).toHaveBeenLastCalledWith({ refreshToken: 'refresh-9' });
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
    expect(api.logout).toHaveBeenCalledWith({ refreshToken: 'refresh-1' });
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
