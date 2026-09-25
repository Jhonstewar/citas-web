import { request } from './httpClient';
import {
  API_ROUTES,
  type Affiliation,
  type AffiliationRequest,
  type UpdateProfileRequest,
  type UserResponse,
} from './contracts';

/**
 * Usuario autenticado según el backend: datos y roles de `GET /api/me`.
 * Es la fuente verificada de identidad; el frontend no la deduce del JWT.
 */
export function getCurrentUser(signal?: AbortSignal): Promise<UserResponse> {
  return request<UserResponse>(API_ROUTES.me, signal === undefined ? {} : { signal });
}

/**
 * HU-008 · Edita el perfil propio (D25): solo nombres, apellidos y teléfono. El titular sale del
 * token. 400 `FIELD_NOT_EDITABLE` (con `field`) si viajara un campo fijo.
 */
export function updateProfile(body: UpdateProfileRequest): Promise<UserResponse> {
  return request<UserResponse>(API_ROUTES.me, { method: 'PUT', body });
}

/**
 * HU-009 · Fija o cambia el plan vigente (solo USER, D26). Cierra la afiliación anterior y abre
 * una nueva; el mismo plan no cambia nada. 422 `INSURANCE_PLAN_UNAVAILABLE` si el plan no está
 * disponible.
 */
export function setAffiliation(insurancePlanId: number): Promise<Affiliation> {
  const body: AffiliationRequest = { insurancePlanId };
  return request<Affiliation>(API_ROUTES.meAffiliation, { method: 'PUT', body });
}

/** HU-009 · Cierra la afiliación vigente sin reemplazo (204, también si no había ninguna). */
export function removeAffiliation(): Promise<void> {
  return request<void>(API_ROUTES.meAffiliation, { method: 'DELETE' });
}
