// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { ApiError } from './api/ApiError';
import type { AuthTokensResponse } from './api/contracts';
import { request } from './api/httpClient';
import type { SessionContextValue } from './auth/SessionContext';
import { SessionProvider } from './auth/SessionProvider';
import { useSession } from './auth/useSession';

/**
 * Flujo de sesión sobre la aplicación real, con el backend simulado en `fetch`:
 * login → vista protegida que consulta `GET /api/me` (HU-002 CA-09), renovación
 * transparente ante 401 (HU-003 CA-06 y CA-07) y logout (HU-004 CA-05).
 */

const USER = {
  id: 1,
  firstNames: 'Ana',
  lastNames: 'Pérez',
  documentType: 'CC',
  documentNumber: '1001',
  email: 'ana@fcv.test',
  phone: '3001234567',
  roles: ['USER'],
};

function tokens(n: number): AuthTokensResponse {
  return { accessToken: `access-${n}`, refreshToken: `refresh-${n}`, tokenType: 'Bearer', expiresIn: 900 };
}

function json(status: number, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

interface Call {
  method: string;
  path: string;
  authorization: string | undefined;
  body: unknown;
}

type Reply = Response | (() => Promise<Response>);

/**
 * Backend simulado: cada ruta responde, en orden, con las respuestas del guion.
 * Una petición fuera del guion hace fallar la prueba.
 */
function backend(script: Record<string, Reply[]>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const path = new URL(url).pathname;
      const headers = (init.headers ?? {}) as Record<string, string>;
      calls.push({
        method,
        path,
        authorization: headers.Authorization,
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });
      const reply = script[`${method} ${path}`]?.shift();
      if (reply === undefined) throw new Error(`Petición fuera del guion: ${method} ${path}`);
      return typeof reply === 'function' ? reply() : reply;
    }),
  );
  return calls;
}

function summary(calls: Call[]): string[] {
  return calls.map((call) => `${call.method} ${call.path} ${call.authorization ?? 'sin-token'}`);
}

function logInThroughForm() {
  fireEvent.change(screen.getByLabelText(/Correo electrónico/), {
    target: { value: 'ana@fcv.test' },
  });
  fireEvent.change(screen.getByLabelText(/Contraseña/), {
    target: { value: 'Clave-Secreta#2026' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
}

const loginHeading = () => screen.findByRole('heading', { name: 'Inicia sesión' });

/** Entrega a la prueba el contexto de sesión vigente tras cada render. */
function CaptureSession({ onSession }: { onSession: (session: SessionContextValue) => void }) {
  const session = useSession();
  useEffect(() => {
    onSession(session);
  }, [session, onSession]);
  return null;
}

const REGISTRATION = {
  firstNames: 'Ana',
  lastNames: 'Pérez',
  documentType: 'CC',
  documentNumber: '1001',
  email: 'ana@fcv.test',
  phone: '3001234567',
  password: 'Clave-Secreta#2026',
};

function registerThroughForm(password = REGISTRATION.password) {
  const type = (label: RegExp, value: string) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  };
  type(/^Nombres/, REGISTRATION.firstNames);
  type(/^Apellidos/, REGISTRATION.lastNames);
  type(/^Tipo de documento/, REGISTRATION.documentType);
  type(/^Número de documento/, REGISTRATION.documentNumber);
  type(/^Correo electrónico/, REGISTRATION.email);
  type(/^Teléfono/, REGISTRATION.phone);
  type(/^Contraseña/, password);
  type(/^Confirmar contraseña/, password);
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

beforeEach(() => {
  window.history.replaceState(null, '', '/login');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('registro en la aplicación (HU-001)', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/registro');
  });

  it('CA-01: envía los siete campos, sin la confirmación ni token, y lleva al login', async () => {
    const calls = backend({ 'POST /api/auth/register': [json(201, USER)] });

    render(<App />);
    registerThroughForm();

    expect(await screen.findByText(/Tu cuenta fue creada/)).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).not.toBeNull();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.authorization).toBeUndefined();
    // `passwordConfirm` es solo validación de cliente: no viaja.
    expect(calls[0]?.body).toEqual(REGISTRATION);
  });

  it('CA-02/CA-03: un 409 muestra el mensaje del servidor y deja reintentar', async () => {
    backend({
      'POST /api/auth/register': [json(409, { title: 'Conflicto', detail: 'El email ya está registrado' })],
    });

    render(<App />);
    registerThroughForm();

    expect(await screen.findByText('El email ya está registrado')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Crear cuenta' }).hasAttribute('disabled')).toBe(false);
  });

  it('CA-04: los fieldErrors del 400 se muestran en su campo', async () => {
    const message = 'no debe superar 72 bytes en UTF-8 (la ñ y las vocales con tilde ocupan 2 bytes; los emojis, 4)';
    backend({
      'POST /api/auth/register': [
        json(400, { title: 'Datos inválidos', detail: 'La petición contiene campos inválidos', fieldErrors: { password: message } }),
      ],
    });

    render(<App />);
    // 40 eñes + "a1": pasa la validación del cliente, pero son 82 bytes.
    registerThroughForm(`${'ñ'.repeat(40)}a1`);

    expect(await screen.findByText(message)).not.toBeNull();
    expect(screen.getByLabelText(/^Contraseña/).getAttribute('aria-invalid')).toBe('true');
  });
});

describe('flujo de sesión en la aplicación', () => {
  it('HU-002 CA-09: tras el login, la vista protegida muestra lo que devuelve /api/me', async () => {
    const calls = backend({
      'POST /api/auth/login': [json(200, tokens(1))],
      'GET /api/me': [json(200, USER)],
      'GET /api/patient/appointments': [json(200, [])],
    });

    render(<App />);
    logInThroughForm();

    // S3: el USER aterriza en su inicio (/paciente), que muestra los datos de /api/me.
    expect(await screen.findByText('Ana Pérez')).not.toBeNull();
    expect(await screen.findByText('ana@fcv.test')).not.toBeNull();
    expect(screen.getByText('Cédula de ciudadanía 1001')).not.toBeNull();
    // El access token viajó solo, y no se volvieron a pedir credenciales.
    await waitFor(() => {
      expect(summary(calls)).toEqual([
        'POST /api/auth/login sin-token',
        'GET /api/me Bearer access-1',
        'GET /api/patient/appointments Bearer access-1',
      ]);
    });
  });

  it('HU-003 CA-06: ante un 401 renueva, reintenta y muestra el resultado sin pedir credenciales', async () => {
    const calls = backend({
      'POST /api/auth/login': [json(200, tokens(1))],
      'GET /api/me': [json(401, { detail: 'Se requiere un access token válido' }), json(200, USER)],
      'POST /api/auth/refresh': [json(200, tokens(2))],
      'GET /api/patient/appointments': [json(200, [])],
    });

    render(<App />);
    logInThroughForm();

    expect(await screen.findByText('Ana Pérez')).not.toBeNull();
    await waitFor(() => {
      expect(summary(calls)).toEqual([
        'POST /api/auth/login sin-token',
        'GET /api/me Bearer access-1',
        'POST /api/auth/refresh sin-token',
        'GET /api/me Bearer access-2',
        'GET /api/patient/appointments Bearer access-2',
      ]);
    });
    // HU-003 CA-08: el refresh token viaja en el cuerpo, nunca en la ruta.
    expect(calls[2]?.body).toEqual({ refreshToken: 'refresh-1' });
    expect(screen.queryByRole('heading', { name: 'Inicia sesión' })).toBeNull();
  });

  it('HU-003 CA-07: si la renovación es rechazada, cierra la sesión y vuelve al login', async () => {
    const calls = backend({
      'POST /api/auth/login': [json(200, tokens(1))],
      'GET /api/me': [json(401, { detail: 'Se requiere un access token válido' })],
      'POST /api/auth/refresh': [json(401, { detail: 'Refresh token inválido' })],
    });

    render(<App />);
    logInThroughForm();

    // Primero entra a la zona protegida (que pide /api/me); el rechazo de la renovación la expulsa.
    await waitFor(() => {
      expect(calls.some((call) => call.path === '/api/auth/refresh')).toBe(true);
    });
    expect(await loginHeading()).not.toBeNull();
    expect(summary(calls)).toEqual([
      'POST /api/auth/login sin-token',
      'GET /api/me Bearer access-1',
      'POST /api/auth/refresh sin-token',
    ]);
  });

  it('HU-004 CA-05: cerrar sesión revoca el refresh token y vuelve al login', async () => {
    const calls = backend({
      'POST /api/auth/login': [json(200, tokens(1))],
      'GET /api/me': [json(200, USER)],
      'GET /api/patient/appointments': [json(200, [])],
      'POST /api/auth/logout': [new Response(null, { status: 204 })],
    });

    render(<App />);
    logInThroughForm();
    await screen.findByText('Ana Pérez');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await loginHeading()).not.toBeNull();
    const logout = calls.find((call) => call.path === '/api/auth/logout');
    expect(logout?.body).toEqual({ refreshToken: 'refresh-1' });
    expect(logout?.authorization).toBeUndefined();

    // Volver a la vista protegida exige iniciar sesión otra vez: el cliente no guarda tokens.
    act(() => {
      window.history.pushState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.queryByRole('heading', { name: 'Sesión iniciada' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).not.toBeNull();
    expect(calls.filter((call) => call.path === '/api/me')).toHaveLength(1);
  });

  it('un logout mientras hay una renovación en vuelo no se deshace cuando esta responde', async () => {
    const refreshReply = deferred<Response>();
    const calls = backend({
      'POST /api/auth/login': [json(200, tokens(1))],
      'GET /api/me': [json(401, { detail: 'Se requiere un access token válido' })],
      'POST /api/auth/refresh': [() => refreshReply.promise],
      'POST /api/auth/logout': [new Response(null, { status: 204 })],
    });

    render(<App />);
    logInThroughForm();
    await waitFor(() => {
      expect(calls.some((call) => call.path === '/api/auth/refresh')).toBe(true);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await loginHeading()).not.toBeNull();
    expect(calls.find((call) => call.path === '/api/auth/logout')?.body).toEqual({
      refreshToken: 'refresh-1',
    });

    // El servidor atiende la renovación después del logout.
    await act(async () => {
      refreshReply.resolve(json(200, tokens(2)));
      await new Promise((settle) => setTimeout(settle, 0));
    });

    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).not.toBeNull();
    expect(calls.some((call) => call.authorization === 'Bearer access-2')).toBe(false);
  });

  it('el 401 de una sesión ya cerrada no se reintenta con la identidad de la sesión nueva', async () => {
    const lateReply = deferred<Response>();
    const calls = backend({
      'POST /api/citas': [() => lateReply.promise],
      'POST /api/auth/logout': [new Response(null, { status: 204 })],
    });

    // Cableado real de `SessionProvider` con el cliente HTTP, sin pantallas de por medio.
    let session: SessionContextValue | undefined;
    const capture = (value: SessionContextValue) => {
      session = value;
    };
    render(
      <SessionProvider>
        <CaptureSession onSession={capture} />
      </SessionProvider>,
    );
    act(() => session?.signIn(tokens(1)));

    // Una acción de la sesión 1 sale; mientras viaja, esa sesión se cierra y entra otra.
    const pending = request('/api/citas', { method: 'POST', body: { motivo: 'control' } });
    act(() => {
      session?.signOut();
      session?.signIn(tokens(9));
    });
    lateReply.resolve(json(401, { detail: 'Se requiere un access token válido' }));

    await expect(pending).rejects.toBeInstanceOf(ApiError);
    expect(summary(calls)).toEqual([
      'POST /api/citas Bearer access-1',
      'POST /api/auth/logout sin-token',
    ]);
    // La sesión nueva sigue intacta: ni se usó, ni se renovó, ni se cerró.
    expect(session?.isAuthenticated).toBe(true);
  });
});
