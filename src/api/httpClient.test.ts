import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './ApiError';
import {
  request,
  setAccessTokenProvider,
  setSessionExpiredHandler,
  setSessionRefresher,
  setTokenStatusProvider,
} from './httpClient';

/**
 * HU-003 CA-06 y CA-07 — renovación transparente del access token.
 *
 * Se prueba el interceptor contra un `fetch` simulado: lo que importa es qué
 * peticiones salen y con qué cabecera `Authorization`, no el backend real.
 */

function response(status: number, body: unknown = null): Response {
  // 204 y 304 no admiten cuerpo en el constructor de Response.
  const payload = body === null ? null : JSON.stringify(body);
  return new Response(payload, {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Cabecera Authorization de la llamada N a fetch (0-indexada). */
function authHeaderOf(fetchMock: ReturnType<typeof vi.fn>, call: number): string | undefined {
  const init = fetchMock.mock.calls[call]?.[1] as RequestInit | undefined;
  return (init?.headers as Record<string, string> | undefined)?.Authorization;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  // El cliente guarda estado de módulo: se devuelve a "sin sesión" entre pruebas.
  setAccessTokenProvider(() => null);
  setSessionRefresher(null);
  setSessionExpiredHandler(null);
  setTokenStatusProvider(null);
});

describe('request — renovación ante 401', () => {
  it('CA-06: renueva, reintenta con el token nuevo y devuelve el resultado', async () => {
    let token = 'access-expirado';
    setAccessTokenProvider(() => token);

    const refresher = vi.fn(async () => {
      token = 'access-nuevo';
      return true;
    });
    setSessionRefresher(refresher);

    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    fetchMock
      .mockResolvedValueOnce(response(401, { detail: 'token expirado' }))
      .mockResolvedValueOnce(response(200, { id: 1, email: 'ana@fcv.test' }));

    const result = await request<{ id: number; email: string }>('/api/me');

    expect(result).toEqual({ id: 1, email: 'ana@fcv.test' });
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authHeaderOf(fetchMock, 0)).toBe('Bearer access-expirado');
    expect(authHeaderOf(fetchMock, 1)).toBe('Bearer access-nuevo');
    // No se pidieron credenciales: la sesión nunca se dio por terminada.
    expect(expired).not.toHaveBeenCalled();
  });

  it('CA-06: el reintento conserva método y cuerpo de la petición original', async () => {
    setAccessTokenProvider(() => 'access');
    setSessionRefresher(async () => true);

    fetchMock
      .mockResolvedValueOnce(response(401))
      .mockResolvedValueOnce(response(201, { id: 9 }));

    const body = { motivo: 'control', sedeId: 3 };
    await request('/api/citas', { method: 'POST', body });

    const retry = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect(retry.method).toBe('POST');
    expect(retry.body).toBe(JSON.stringify(body));
  });

  it('CA-07: si la renovación es rechazada, termina la sesión y propaga el error', async () => {
    setAccessTokenProvider(() => 'access-expirado');
    const refresher = vi.fn(async () => false);
    setSessionRefresher(refresher);

    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    fetchMock.mockResolvedValue(response(401, { detail: 'no autorizado' }));

    const error = await request('/api/me').catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).kind).toBe('session');
    expect(refresher).toHaveBeenCalledTimes(1);
    expect(expired).toHaveBeenCalledTimes(1);
    // No se reintentó: la renovación falló.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no encadena renovaciones: un 401 tras renovar cierra la sesión', async () => {
    setAccessTokenProvider(() => 'access');
    const refresher = vi.fn(async () => true);
    setSessionRefresher(refresher);

    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    fetchMock.mockResolvedValue(response(401));

    await expect(request('/api/me')).rejects.toBeInstanceOf(ApiError);

    expect(refresher).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('no renueva ante el 401 de un login fallido', async () => {
    setAccessTokenProvider(() => 'access');
    const refresher = vi.fn(async () => true);
    setSessionRefresher(refresher);

    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    fetchMock.mockResolvedValue(response(401, { detail: 'Credenciales inválidas' }));

    const error = await request('/api/auth/login', {
      method: 'POST',
      body: { email: 'ana@fcv.test', password: 'mala' },
      authenticated: false,
    }).catch((cause: unknown) => cause);

    expect((error as ApiError).message).toBe('Credenciales inválidas');
    expect(refresher).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('no renueva cuando no había sesión que renovar', async () => {
    setAccessTokenProvider(() => null);
    const refresher = vi.fn(async () => true);
    setSessionRefresher(refresher);

    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    fetchMock.mockResolvedValue(response(401));

    await expect(request('/api/me')).rejects.toBeInstanceOf(ApiError);

    expect(refresher).not.toHaveBeenCalled();
    expect(expired).not.toHaveBeenCalled();
  });

  it('un 401 que llega con un token ya renovado reintenta sin rotar otra vez', async () => {
    let token = 'access-viejo';
    setAccessTokenProvider(() => token);
    const refresher = vi.fn(async () => true);
    setSessionRefresher(refresher);

    // Mientras la petición viajaba, otra renovó la sesión.
    fetchMock
      .mockImplementationOnce(async () => {
        token = 'access-nuevo';
        return response(401);
      })
      .mockResolvedValueOnce(response(200, { ok: true }));

    await expect(request('/api/me')).resolves.toEqual({ ok: true });
    expect(refresher).not.toHaveBeenCalled();
    expect(authHeaderOf(fetchMock, 1)).toBe('Bearer access-nuevo');
  });

  it('el 401 de una sesión ya cerrada no se reintenta con la sesión nueva ni la renueva', async () => {
    // La petición salió con la sesión anterior; mientras viajaba hubo logout y otro login.
    let token = 'access-sesion-vieja';
    setAccessTokenProvider(() => token);
    setTokenStatusProvider((sent) => (sent === token ? 'current' : 'foreign'));
    const refresher = vi.fn(async () => true);
    setSessionRefresher(refresher);
    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    fetchMock.mockImplementationOnce(async () => {
      token = 'access-sesion-nueva';
      return response(401);
    });

    await expect(request('/api/citas', { method: 'POST', body: {} })).rejects.toBeInstanceOf(
      ApiError,
    );
    // Ni reintento con la identidad de otra sesión, ni rotación de su refresh token.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresher).not.toHaveBeenCalled();
    // El aviso lleva el token que se envió, no el vigente: así no cierra la sesión nueva.
    expect(expired).toHaveBeenCalledWith('access-sesion-vieja');
  });

  it('sin estado de sesión instalado, un 401 cuyo token ya no existe no se reintenta ni renueva', async () => {
    let token: string | null = 'access';
    setAccessTokenProvider(() => token);
    const refresher = vi.fn(async () => true);
    setSessionRefresher(refresher);

    // La sesión se cerró mientras la petición viajaba.
    fetchMock.mockImplementationOnce(async () => {
      token = null;
      return response(401);
    });

    await expect(request('/api/me')).rejects.toBeInstanceOf(ApiError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(refresher).not.toHaveBeenCalled();
  });

  it('un 401 definitivo avisa con el token que fue rechazado', async () => {
    setAccessTokenProvider(() => 'access-1');
    setSessionRefresher(async () => false);
    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    fetchMock.mockResolvedValue(response(401));

    await expect(request('/api/me')).rejects.toBeInstanceOf(ApiError);
    expect(expired).toHaveBeenCalledWith('access-1');
  });

  it('si la renovación no obtiene respuesta, propaga el error sin cerrar la sesión', async () => {
    setAccessTokenProvider(() => 'access');
    const outage = new ApiError('network', 0, 'sin red');
    setSessionRefresher(async () => {
      throw outage;
    });
    const expired = vi.fn();
    setSessionExpiredHandler(expired);

    fetchMock.mockResolvedValue(response(401));

    await expect(request('/api/me')).rejects.toBe(outage);
    expect(expired).not.toHaveBeenCalled();
  });

  it('una respuesta correcta no toca el renovador', async () => {
    setAccessTokenProvider(() => 'access');
    const refresher = vi.fn(async () => true);
    setSessionRefresher(refresher);

    fetchMock.mockResolvedValueOnce(response(200, { ok: true }));

    await expect(request('/api/me')).resolves.toEqual({ ok: true });
    expect(refresher).not.toHaveBeenCalled();
  });
});

describe('request — credenciales (cookie del refresh token, D36)', () => {
  it('con withCredentials sale con credentials "include" y, sin cuerpo, sin Content-Type', async () => {
    fetchMock.mockResolvedValueOnce(response(204));

    await request('/api/auth/logout', { method: 'POST', authenticated: false, withCredentials: true });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('por defecto no envía credenciales: la cookie solo hace falta en /api/auth', async () => {
    setAccessTokenProvider(() => 'access');
    fetchMock.mockResolvedValueOnce(response(200, { ok: true }));

    await request('/api/me');

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.credentials).toBeUndefined();
  });
});
