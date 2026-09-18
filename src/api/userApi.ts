import { request } from './httpClient';
import { API_ROUTES, type UserResponse } from './contracts';

/**
 * Usuario autenticado según el backend: datos y roles de `GET /api/me`.
 * Es la fuente verificada de identidad; el frontend no la deduce del JWT.
 */
export function getCurrentUser(signal?: AbortSignal): Promise<UserResponse> {
  return request<UserResponse>(API_ROUTES.me, signal === undefined ? {} : { signal });
}
