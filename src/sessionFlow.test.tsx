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
 * transparente ante 401 (HU-003 CA-06 y CA-07), logout (HU-004 CA-05) y, desde D36,
 * restauración de la sesión al recargar (F5) con la cookie `HttpOnly` del refresh token.
 *
 * La cookie no es visible para JavaScript ni para este `fetch` simulado: lo que se afirma es lo
 * que el cliente controla (`credentials: 'include'`, cuerpo vacío) y cómo reacciona a las
 * respuestas del servidor (200 → sesión; 401 → sin sesión).
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

/** Respuesta de login/refresh desde D36: sin `refreshToken` en el cuerpo. */
function tokens(n: number): AuthTokensResponse {
  return { accessToken: `access-${n}`, tokenType: 'Bearer', expiresIn: 900 };
}

function json(status: number, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Lo que responde el servidor a `refresh` sin cookie (o con una inválida). */
function noCookie(): Response {
  return json(401, { title: 'No autorizado', detail: 'La sesión no es válida o ha expirado' });
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
  credentials: RequestCredentials | undefined;
  body: unknown;
}

type Reply = Response | (() => Promise<Response>);

const REFRESH = 'POST /api/auth/refresh';

/**
 * Backend simulado: cada ruta responde, en orden, con las respuestas del guion.
 * Una petición fuera del guion hace fallar la prueba.
 *
 * La aplicación intenta restaurar la sesión al arrancar (`POST /api/auth/refresh`). Si el guion
 * no menciona esa ruta, responde "sin cookie"; si la menciona, la PRIMERA respuesta es la del
 * arranque.
 */
function backend(script: Record<string, Reply[]>): Call[] {
  const calls: Call[] = [];
  const queues: Record<string, Reply[]> = { [REFRESH]: [noCookie()], ...script };
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
        credentials: init.credentials,
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      });
      const reply = queues[`${method} ${path}`]?.shift();
      if (reply === undefined) throw new Error(`Petición fuera del guion: ${method} ${path}`);
      return typeof reply === 'function' ? reply() : reply;
    }),
  );
  return calls;
}

function summary(calls: Call[]): string[] {
  return calls.map((call) => `${call.method} ${call.path} ${call.authorization ?? 'sin-token'}`);
}

const byPath = (calls: Call[], path: string) => calls.filter((call) => call.path === path);

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

/** Recargar la página: memoria de JS nueva (aplicación nueva); el navegador conserva la URL. */
function reloadAt(path: string) {
  window.history.replaceState(null, '', path);
  return render(<App />);
}

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
    const calls = backend({
      // Catálogo público del plan de afiliación: la pantalla lo pide al montarse.
      'GET /api/catalogs/insurance-plans': [json(200, [])],
      'POST /api/auth/register': [json(201, USER)],
    });

    render(<App />);
    registerThroughForm();

    expect(await screen.findByText(/Tu cuenta fue creada/)).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).not.toBeNull();
    const registerCall = calls.find((call) => call.path === '/api/auth/register');
    // Catálogo, registro y el intento de restaurar sesión del arranque (sin cookie).
    expect(calls).toHaveLength(3);
    expect(registerCall?.authorization).toBeUndefined();
    // El registro no necesita la cookie de sesión: no sale con credenciales.
    expect(registerCall?.credentials).toBeUndefined();
    // `passwordConfirm` es solo validación de cliente: no viaja. El plan de afiliación tampoco,
    // porque el usuario no eligió ninguno (es opcional).
    expect(registerCall?.body).toEqual(REGISTRATION);
  });

  it('CA-02/CA-03: un 409 muestra el mensaje del servidor y deja reintentar', async () => {
    backend({
      'GET /api/catalogs/insurance-plans': [json(200, [])],
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
      'GET /api/catalogs/insurance-plans': [json(200, [])],
      'POST /api/auth/register': [
        json(400, { title: 'Datos inválidos', detail: 'La petición contiene campos inválidos', fieldErrors: { password: message } }),
      ],
    });

    render(<App />);
    // El servidor es la autoridad: aunque la contraseña pase la validación del cliente, su
    // `fieldErrors` se muestra en el campo. (Desde D29 el cliente también bloquea > 72 bytes.)
    registerThroughForm();

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
        'POST /api/auth/refresh sin-token',
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
      [REFRESH]: [noCookie(), json(200, tokens(2))],
      'GET /api/patient/appointments': [json(200, [])],
    });

    render(<App />);
    logInThroughForm();

    expect(await screen.findByText('Ana Pérez')).not.toBeNull();
    await waitFor(() => {
      expect(summary(calls)).toEqual([
        'POST /api/auth/refresh sin-token',
        'POST /api/auth/login sin-token',
        'GET /api/me Bearer access-1',
        'POST /api/auth/refresh sin-token',
        'GET /api/me Bearer access-2',
        'GET /api/patient/appointments Bearer access-2',
      ]);
    });
    // HU-003 CA-08 / D36: el refresh token no viaja en el cuerpo ni en la ruta, sino en la cookie.
    expect(calls[3]?.body).toBeUndefined();
    expect(calls[3]?.credentials).toBe('include');
    expect(screen.queryByRole('heading', { name: 'Inicia sesión' })).toBeNull();
  });

  it('HU-003 CA-07: si la renovación es rechazada, cierra la sesión y vuelve al login', async () => {
    const calls = backend({
      'POST /api/auth/login': [json(200, tokens(1))],
      'GET /api/me': [json(401, { detail: 'Se requiere un access token válido' })],
      [REFRESH]: [noCookie(), noCookie()],
    });

    render(<App />);
    logInThroughForm();

    // Primero entra a la zona protegida (que pide /api/me); el rechazo de la renovación la expulsa.
    await waitFor(() => {
      expect(byPath(calls, '/api/auth/refresh')).toHaveLength(2);
    });
    expect(await loginHeading()).not.toBeNull();
    expect(summary(calls)).toEqual([
      'POST /api/auth/refresh sin-token',
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
    // D36: sin cuerpo; el servidor revoca la familia de la cookie, que viaja por `credentials`.
    expect(logout?.body).toBeUndefined();
    expect(logout?.credentials).toBe('include');
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
      [REFRESH]: [noCookie(), () => refreshReply.promise],
      'POST /api/auth/logout': [new Response(null, { status: 204 })],
    });

    render(<App />);
    logInThroughForm();
    await waitFor(() => {
      expect(byPath(calls, '/api/auth/refresh')).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(await loginHeading()).not.toBeNull();
    expect(byPath(calls, '/api/auth/logout')).toHaveLength(1);

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
      // Intento de restaurar sesión del arranque (sin cookie).
      'POST /api/auth/refresh sin-token',
      'POST /api/citas Bearer access-1',
      'POST /api/auth/logout sin-token',
    ]);
    // La sesión nueva sigue intacta: ni se usó, ni se renovó, ni se cerró.
    expect(session?.isAuthenticated).toBe(true);
  });
});

describe('recargar la página (F5) con el refresh token en cookie HttpOnly (D36)', () => {
  it('con cookie válida, restaura la sesión en la misma ruta protegida sin pasar por el login', async () => {
    const refreshReply = deferred<Response>();
    const calls = backend({
      [REFRESH]: [() => refreshReply.promise],
      'GET /api/me': [json(200, USER)],
      'GET /api/patient/appointments': [json(200, [])],
      'GET /api/catalogs/appointment-statuses': [json(200, [])],
    });

    reloadAt('/paciente/citas');

    // Mientras el servidor responde, se comprueba la sesión: ni login ni rebote de ruta.
    expect(screen.getByRole('status').textContent).toContain('Comprobando tu sesión');
    expect(screen.queryByRole('heading', { name: 'Inicia sesión' })).toBeNull();
    expect(window.location.pathname).toBe('/paciente/citas');

    await act(async () => {
      refreshReply.resolve(json(200, tokens(7)));
      await Promise.resolve();
    });

    expect(await screen.findByRole('heading', { name: 'Mis citas' })).not.toBeNull();
    expect(window.location.pathname).toBe('/paciente/citas');
    expect(byPath(calls, '/api/auth/login')).toHaveLength(0);
    // Los datos del usuario salen de /api/me con el access token renovado.
    expect(byPath(calls, '/api/me')[0]?.authorization).toBe('Bearer access-7');
    // Una sola renovación en el arranque, sin cuerpo y con la cookie.
    const refreshes = byPath(calls, '/api/auth/refresh');
    expect(refreshes).toHaveLength(1);
    expect(refreshes[0]?.body).toBeUndefined();
    expect(refreshes[0]?.credentials).toBe('include');
    expect(refreshes[0]?.authorization).toBeUndefined();
  });

  it('sin cookie, lleva al login sin mostrar errores y, tras entrar, vuelve a la ruta pedida', async () => {
    const calls = backend({
      'POST /api/auth/login': [json(200, tokens(1))],
      'GET /api/me': [json(200, USER)],
      'GET /api/patient/appointments': [json(200, [])],
      'GET /api/catalogs/appointment-statuses': [json(200, [])],
    });

    reloadAt('/paciente/citas');

    expect(await loginHeading()).not.toBeNull();
    // El 401 del arranque es "no hay sesión", no un fallo que anunciar.
    expect(screen.queryByRole('alert')).toBeNull();
    expect(byPath(calls, '/api/me')).toHaveLength(0);

    logInThroughForm();
    expect(await screen.findByRole('heading', { name: 'Mis citas' })).not.toBeNull();
    expect(window.location.pathname).toBe('/paciente/citas');
  });

  it('API caída (5xx) al arrancar en una ruta protegida: error con "Reintentar", no el login', async () => {
    const calls = backend({
      [REFRESH]: [
        json(503, { title: 'Servicio no disponible', detail: 'El servicio no está disponible' }),
        json(200, tokens(3)),
      ],
      'GET /api/me': [json(200, USER)],
      'GET /api/patient/appointments': [json(200, [])],
      'GET /api/catalogs/appointment-statuses': [json(200, [])],
    });

    reloadAt('/paciente/citas');

    expect(await screen.findByText('No pudimos comprobar tu sesión')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Inicia sesión' })).toBeNull();
    expect(window.location.pathname).toBe('/paciente/citas');
    expect(byPath(calls, '/api/me')).toHaveLength(0);

    // Al volver el servicio, reintentar restaura la sesión en la misma ruta.
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Mis citas' })).not.toBeNull();
    expect(window.location.pathname).toBe('/paciente/citas');
    expect(byPath(calls, '/api/auth/refresh')).toHaveLength(2);
    expect(byPath(calls, '/api/auth/login')).toHaveLength(0);
  });

  it('sin red al arrancar: error con "Reintentar"; si al reintentar el servidor dice 401, va al login', async () => {
    backend({
      [REFRESH]: [() => Promise.reject(new TypeError('Failed to fetch')), noCookie()],
    });

    reloadAt('/paciente/citas');

    expect(await screen.findByText('No pudimos comprobar tu sesión')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    // El 401 sí es un veredicto: no hay sesión y se pide entrar, conservando la ruta de retorno.
    expect(await loginHeading()).not.toBeNull();
    expect(screen.queryByText('No pudimos comprobar tu sesión')).toBeNull();
  });

  it('en /login, si la cookie restaura la sesión, redirige al inicio del rol', async () => {
    const calls = backend({
      [REFRESH]: [json(200, tokens(5))],
      'GET /api/me': [json(200, USER)],
      'GET /api/patient/appointments': [json(200, [])],
    });

    reloadAt('/login');

    expect(await screen.findByRole('heading', { name: 'Hola, Ana' })).not.toBeNull();
    expect(window.location.pathname).toBe('/paciente');
    expect(byPath(calls, '/api/auth/login')).toHaveLength(0);
  });

  it('en /login con ruta de retorno, la sesión restaurada vuelve a esa ruta', async () => {
    backend({
      [REFRESH]: [json(200, tokens(5))],
      'GET /api/me': [json(200, USER)],
      'GET /api/patient/appointments': [json(200, [])],
      'GET /api/catalogs/appointment-statuses': [json(200, [])],
    });

    // El estado del historial sobrevive a la recarga: es el `from` que dejó `RequireAuth`.
    window.history.replaceState({ usr: { from: '/paciente/citas' }, key: 'retorno', idx: 0 }, '', '/login');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Mis citas' })).not.toBeNull();
    expect(window.location.pathname).toBe('/paciente/citas');
  });

  it('si la renovación ante un 401 es rechazada, vuelve al login conservando la ruta de retorno', async () => {
    const calls = backend({
      [REFRESH]: [json(200, tokens(1)), noCookie()],
      'GET /api/me': [json(200, USER), json(200, USER)],
      'GET /api/patient/appointments': [
        json(401, { detail: 'Se requiere un access token válido' }),
        json(200, []),
      ],
      'GET /api/catalogs/appointment-statuses': [json(200, []), json(200, [])],
      'POST /api/auth/login': [json(200, tokens(2))],
    });

    reloadAt('/paciente/citas');

    expect(await loginHeading()).not.toBeNull();
    expect(byPath(calls, '/api/auth/refresh')).toHaveLength(2);

    logInThroughForm();
    expect(await screen.findByRole('heading', { name: 'Mis citas' })).not.toBeNull();
    expect(window.location.pathname).toBe('/paciente/citas');
  });

  it('login, refresh y logout salen con credentials "include"; el resto de la API no', async () => {
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

    const [bootRefresh] = byPath(calls, '/api/auth/refresh');
    const [login] = byPath(calls, '/api/auth/login');
    const [logout] = byPath(calls, '/api/auth/logout');
    expect(bootRefresh).toMatchObject({ credentials: 'include', body: undefined });
    expect(login?.credentials).toBe('include');
    expect(logout).toMatchObject({ credentials: 'include', body: undefined });
    // El cuerpo del login ya no puede traer el refresh token: solo credenciales de usuario.
    expect(login?.body).toEqual({ email: 'ana@fcv.test', password: 'Clave-Secreta#2026' });
    for (const call of [...byPath(calls, '/api/me'), ...byPath(calls, '/api/patient/appointments')]) {
      expect(call.credentials).toBeUndefined();
    }
  });

  it('cerrar sesión limpia el estado local aunque la revocación falle por red', async () => {
    const calls = backend({
      'POST /api/auth/login': [json(200, tokens(1))],
      'GET /api/me': [json(200, USER)],
      'GET /api/patient/appointments': [json(200, [])],
      'POST /api/auth/logout': [() => Promise.reject(new TypeError('Failed to fetch'))],
    });

    render(<App />);
    logInThroughForm();
    await screen.findByText('Ana Pérez');

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(await loginHeading()).not.toBeNull();
    expect(byPath(calls, '/api/auth/logout')).toHaveLength(1);
    // Sin sesión local: la zona protegida vuelve a pedir el login y no reutiliza el token.
    act(() => {
      window.history.pushState(null, '', '/paciente');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).not.toBeNull();
    expect(byPath(calls, '/api/me')).toHaveLength(1);
  });
});
