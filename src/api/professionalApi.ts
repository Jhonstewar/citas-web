import { request } from './httpClient';
import {
  API_ROUTES,
  withQuery,
  type Block,
  type BlockRequest,
  type IsoDate,
  type Professional,
  type ProfessionalAppointment,
} from './contracts';

/** Agenda y citas del PROFESSIONAL (HU-017..021). El titular sale siempre del token. */

function withSignal(signal: AbortSignal | undefined) {
  return signal === undefined ? {} : { signal };
}

export function getMyProfile(signal?: AbortSignal): Promise<Professional> {
  return request(API_ROUTES.professional.me, withSignal(signal));
}

/** Bloques propios entre `from` y `to` (ambos incluidos; máximo 62 días). */
export function listBlocks(from: IsoDate, to: IsoDate, signal?: AbortSignal): Promise<Block[]> {
  return request(withQuery(API_ROUTES.professional.blocks, { from, to }), withSignal(signal));
}

export function createBlock(body: BlockRequest): Promise<Block> {
  return request(API_ROUTES.professional.blocks, { method: 'POST', body });
}

export function updateBlock(id: number, body: BlockRequest): Promise<Block> {
  return request(API_ROUTES.professional.block(id), { method: 'PUT', body });
}

export function deleteBlock(id: number): Promise<void> {
  return request(API_ROUTES.professional.block(id), { method: 'DELETE' });
}

/* ---------------------- S4 · Citas del profesional (HU-020, HU-021) ------- */

/**
 * HU-020 · Citas `APPROVED` propias entre `from` y `to` (ambos obligatorios, máximo 62 días;
 * un solo día = `from` igual a `to`), ordenadas por fecha y hora. `siteId` es opcional.
 */
export function listAppointments(
  from: IsoDate,
  to: IsoDate,
  siteId?: number,
  signal?: AbortSignal,
): Promise<ProfessionalAppointment[]> {
  return request(
    withQuery(API_ROUTES.professional.appointments, { from, to, siteId }),
    withSignal(signal),
  );
}

/**
 * HU-021 · Cierra la cita como atendida. 404 si no es propia; 409 `INVALID_TRANSITION` si no
 * está `APPROVED`, `APPOINTMENT_NOT_STARTED` antes de la hora de inicio (D19).
 */
export function completeAppointment(id: number): Promise<ProfessionalAppointment> {
  return request(API_ROUTES.professional.completeAppointment(id), { method: 'POST' });
}

/** HU-021 · Cierra la cita como inasistencia. Mismos errores que `completeAppointment`. */
export function markNoShow(id: number): Promise<ProfessionalAppointment> {
  return request(API_ROUTES.professional.noShowAppointment(id), { method: 'POST' });
}
