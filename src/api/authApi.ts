import { request } from './httpClient';
import {
  API_ROUTES,
  type AuthTokensResponse,
  type LoginRequest,
  type PasswordRecoveryRequest,
  type PasswordRecoveryResponse,
  type RefreshRequest,
  type RegisterRequest,
  type UserResponse,
} from './contracts';

/**
 * Operaciones de autenticación. Único módulo que usa las rutas de auth
 * (importadas de `contracts.ts`). Los componentes llaman a estas funciones y
 * nunca construyen URLs.
 */

/** RF-01 · Registro de usuario. */
export function register(payload: RegisterRequest): Promise<UserResponse> {
  return request<UserResponse>(API_ROUTES.auth.register, {
    method: 'POST',
    body: payload,
    authenticated: false,
  });
}

/** RF-02 · Login por email + contraseña. */
export function login(payload: LoginRequest): Promise<AuthTokensResponse> {
  return request<AuthTokensResponse>(API_ROUTES.auth.login, {
    method: 'POST',
    body: payload,
    authenticated: false,
  });
}

/** RF-02 · Renovación del access token con rotación del refresh token. */
export function refresh(payload: RefreshRequest): Promise<AuthTokensResponse> {
  return request<AuthTokensResponse>(API_ROUTES.auth.refresh, {
    method: 'POST',
    body: payload,
    authenticated: false,
  });
}

/** RF-02 · Logout: revoca en el servidor la familia del refresh token. */
export function logout(payload: RefreshRequest): Promise<void> {
  return request<void>(API_ROUTES.auth.logout, {
    method: 'POST',
    body: payload,
    authenticated: false,
  });
}

/** RF-03 · Solicitud de recuperación de contraseña por email. */
export function requestPasswordRecovery(
  payload: PasswordRecoveryRequest,
): Promise<PasswordRecoveryResponse> {
  return request<PasswordRecoveryResponse>(API_ROUTES.auth.passwordRecovery, {
    method: 'POST',
    body: payload,
    authenticated: false,
  });
}
