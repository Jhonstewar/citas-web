import { afterEach, describe, expect, it, vi } from 'vitest';
import { login, logout, refresh } from './authApi';

/**
 * Rutas de sesión con el refresh token en cookie `HttpOnly` (D36): sin cuerpo en refresh y
 * logout, `credentials: 'include'` en las tres, y el login no se adelanta a un logout en vuelo.
 */

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const TOKENS = { accessToken: 'access-1', tokenType: 'Bearer', expiresIn: 900 };

function initOf(fetchMock: ReturnType<typeof vi.fn>, call: number): RequestInit {
  return fetchMock.mock.calls[call]?.[1] as RequestInit;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('authApi — refresh token en cookie (D36)', () => {
  it('refresh sale sin cuerpo, sin Bearer y con credentials "include"', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(json(200, TOKENS));
    vi.stubGlobal('fetch', fetchMock);

    await expect(refresh()).resolves.toEqual(TOKENS);

    const init = initOf(fetchMock, 0);
    expect(init.method).toBe('POST');
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('include');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('logout sale sin cuerpo y con credentials "include"', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(logout()).resolves.toBeUndefined();

    const init = initOf(fetchMock, 0);
    expect(init.body).toBeUndefined();
    expect(init.credentials).toBe('include');
  });

  it('el login espera al logout en vuelo: su Set-Cookie de borrado no pisa la cookie nueva', async () => {
    let answerLogout!: (response: Response) => void;
    const fetchMock = vi
      .fn()
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          answerLogout = resolve;
        }),
      )
      .mockResolvedValueOnce(json(200, TOKENS));
    vi.stubGlobal('fetch', fetchMock);

    const loggingOut = logout();
    const loggingIn = login({ email: 'ana@fcv.test', password: 'Clave-Secreta#2026' });
    await new Promise((settle) => setTimeout(settle, 0));
    // El login aún no salió.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    answerLogout(new Response(null, { status: 204 }));
    await loggingOut;
    await expect(loggingIn).resolves.toEqual(TOKENS);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(initOf(fetchMock, 1).credentials).toBe('include');
  });

  it('un logout fallido no bloquea el login siguiente', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(200, TOKENS));
    vi.stubGlobal('fetch', fetchMock);

    await expect(logout()).rejects.toMatchObject({ kind: 'network' });
    await expect(login({ email: 'ana@fcv.test', password: 'x' })).resolves.toEqual(TOKENS);
  });
});
