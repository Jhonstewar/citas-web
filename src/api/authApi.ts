import { request } from './httpClient';
import {
  API_ROUTES,
  type AuthTokensResponse,
  type LoginRequest,
  type PasswordRecoveryRequest,
  type PasswordRecoveryResponse,
  type PasswordResetRequest,
  type RegisterRequest,
  type UserResponse,
} from './contracts';

/**
 * Operaciones de autenticación. Único módulo que usa las rutas de auth
 * (importadas de `contracts.ts`). Los componentes llaman a estas funciones y
 * nunca construyen URLs.
 *
 * Refresh token (D36): vive en la cookie `HttpOnly` `fcv_refresh` (`Path=/api/auth`), que
 * JavaScript no lee ni escribe. Login, refresh y logout salen con `credentials: 'include'` para
 * que el navegador la reciba (`Set-Cookie`) y la envíe; refresh y logout van SIN cuerpo.
 */

/** RF-01 · Registro de usuario. */
export function register(payload: RegisterRequest): Promise<UserResponse> {
  return request<UserResponse>(API_ROUTES.auth.register, {
    method: 'POST',
    body: payload,
    authenticated: false,
  });
}

/**
 * Logout en vuelo. Su respuesta trae `Set-Cookie: fcv_refresh=; Max-Age=0`: si llegara DESPUÉS
 * de la de un login nuevo, borraría la cookie recién emitida y el siguiente F5 perdería la
 * sesión. Por eso el login espera a que termine (con un tope, para que un logout colgado no
 * bloquee la entrada).
 */
let pendingLogout: Promise<void> | null = null;

/** Tope de espera del login por un logout anterior sin respuesta. */
const LOGOUT_SETTLE_TIMEOUT_MS = 3000;

function logoutSettled(): Promise<void> {
  const pending = pendingLogout;
  if (pending === null) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, LOGOUT_SETTLE_TIMEOUT_MS);
    void pending.finally(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/** RF-02 · Login por email + contraseña. El refresh token llega en la cookie, no en el cuerpo. */
export async function login(payload: LoginRequest): Promise<AuthTokensResponse> {
  await logoutSettled();
  return request<AuthTokensResponse>(API_ROUTES.auth.login, {
    method: 'POST',
    body: payload,
    authenticated: false,
    withCredentials: true,
  });
}

/**
 * RF-02 · Renovación del access token con rotación del refresh token. Sin cuerpo: el servidor
 * lee la cookie. 200 → tokens nuevos y cookie rotada; 401 → sesión no recuperable (y la cookie
 * queda borrada).
 */
export function refresh(): Promise<AuthTokensResponse> {
  return request<AuthTokensResponse>(API_ROUTES.auth.refresh, {
    method: 'POST',
    authenticated: false,
    withCredentials: true,
  });
}

/**
 * RF-02 · Logout: revoca en el servidor la familia del refresh token de la cookie y la borra.
 * Sin cuerpo; el servidor responde 204 siempre.
 */
export function logout(): Promise<void> {
  const pending = request<void>(API_ROUTES.auth.logout, {
    method: 'POST',
    authenticated: false,
    withCredentials: true,
  });
  const tracked = pending.then(
    () => undefined,
    () => undefined,
  );
  pendingLogout = tracked;
  void tracked.then(() => {
    if (pendingLogout === tracked) pendingLogout = null;
  });
  return pending;
}

/**
 * RF-03 · HU-006 · Solicitud de recuperación por email: 202 con `message` idéntico exista o no
 * el email (y `devToken` solo en laboratorio, D27).
 */
export function requestPasswordRecovery(
  payload: PasswordRecoveryRequest,
): Promise<PasswordRecoveryResponse> {
  return request<PasswordRecoveryResponse>(API_ROUTES.auth.passwordRecovery, {
    method: 'POST',
    body: payload,
    authenticated: false,
  });
}

/**
 * RF-03 · HU-007 · Restablece la contraseña con el token de un solo uso (204). Pública: no
 * adjunta Bearer ni dispara renovación. 400 `RESET_TOKEN_INVALID` (una sola respuesta para
 * inexistente, caducado, usado o revocado) o 400 de validación por la política D29. El backend
 * revoca todos los refresh tokens del usuario: las sesiones abiertas deben volver a entrar.
 */
export function resetPassword(payload: PasswordResetRequest): Promise<void> {
  return request<void>(API_ROUTES.auth.passwordReset, {
    method: 'POST',
    body: payload,
    authenticated: false,
  });
}
