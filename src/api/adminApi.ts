import { request } from './httpClient';
import {
  API_ROUTES,
  withQuery,
  type AdminAppointment,
  type AdminSummary,
  type CreateEpsPlanRequest,
  type CreateEpsRequest,
  type CreateProfessionalRequest,
  type CreateSpecialtyRequest,
  type Eps,
  type EpsPlan,
  type InboxEntry,
  type InboxFilters,
  type Professional,
  type ProfessionalFilters,
  type ProfessionalSitesRequest,
  type ProfessionalSpecialtiesRequest,
  type Specialty,
  type UpdateEpsPlanRequest,
  type UpdateEpsRequest,
  type UpdateProfessionalRequest,
  type UpdateSpecialtyRequest,
} from './contracts';

/** Operaciones del ADMIN (HU-011, HU-012, HU-013..016, HU-029..031). */

function withSignal(signal: AbortSignal | undefined) {
  return signal === undefined ? {} : { signal };
}

/* ----------------------------- Especialidades ----------------------------- */

export function listSpecialties(signal?: AbortSignal): Promise<Specialty[]> {
  return request(API_ROUTES.admin.specialties, withSignal(signal));
}

export function createSpecialty(body: CreateSpecialtyRequest): Promise<Specialty> {
  return request(API_ROUTES.admin.specialties, { method: 'POST', body });
}

export function updateSpecialty(id: number, body: UpdateSpecialtyRequest): Promise<Specialty> {
  return request(API_ROUTES.admin.specialty(id), { method: 'PUT', body });
}

export function setSpecialtyActive(id: number, active: boolean): Promise<Specialty> {
  return request(API_ROUTES.admin.specialtyStatus(id), { method: 'PATCH', body: { active } });
}

export function deleteSpecialty(id: number): Promise<void> {
  return request(API_ROUTES.admin.specialty(id), { method: 'DELETE' });
}

/* ------------------------------ Profesionales ----------------------------- */

export function listProfessionals(
  filters: ProfessionalFilters = {},
  signal?: AbortSignal,
): Promise<Professional[]> {
  return request(withQuery(API_ROUTES.admin.professionals, { ...filters }), withSignal(signal));
}

export function getProfessional(id: number, signal?: AbortSignal): Promise<Professional> {
  return request(API_ROUTES.admin.professional(id), withSignal(signal));
}

export function createProfessional(body: CreateProfessionalRequest): Promise<Professional> {
  return request(API_ROUTES.admin.professionals, { method: 'POST', body });
}

export function updateProfessional(
  id: number,
  body: UpdateProfessionalRequest,
): Promise<Professional> {
  return request(API_ROUTES.admin.professional(id), { method: 'PUT', body });
}

export function updateProfessionalSpecialties(
  id: number,
  body: ProfessionalSpecialtiesRequest,
): Promise<Professional> {
  return request(API_ROUTES.admin.professionalSpecialties(id), { method: 'PUT', body });
}

export function updateProfessionalSites(
  id: number,
  body: ProfessionalSitesRequest,
): Promise<Professional> {
  return request(API_ROUTES.admin.professionalSites(id), { method: 'PUT', body });
}

export function setProfessionalActive(id: number, active: boolean): Promise<Professional> {
  return request(API_ROUTES.admin.professionalStatus(id), {
    method: 'PATCH',
    body: { active },
  });
}

/* ------------------------------ Operación --------------------------------- */

/**
 * Bandeja de pendientes: solicitudes especializadas y, desde S4, reprogramaciones. `type` filtra
 * por clase de entrada; en una reprogramación, fecha y sede se aplican a la franja propuesta (D24).
 */
export function getInbox(filters: InboxFilters = {}, signal?: AbortSignal): Promise<InboxEntry[]> {
  return request(withQuery(API_ROUTES.admin.inbox, { ...filters }), withSignal(signal));
}

export function getAdminAppointment(id: number, signal?: AbortSignal): Promise<AdminAppointment> {
  return request(API_ROUTES.admin.appointment(id), withSignal(signal));
}

export function approveAppointment(id: number): Promise<AdminAppointment> {
  return request(API_ROUTES.admin.approve(id), { method: 'POST' });
}

export function rejectAppointment(id: number, reason: string): Promise<AdminAppointment> {
  return request(API_ROUTES.admin.reject(id), { method: 'POST', body: { reason } });
}

export function getSummary(signal?: AbortSignal): Promise<AdminSummary> {
  return request(API_ROUTES.admin.summary, withSignal(signal));
}

/* -------------------------- S4 · Reprogramaciones (HU-031) ---------------- */

/**
 * Aprueba una solicitud de reprogramación (el id es el de la solicitud, no el de la cita).
 * Devuelve la cita ya movida a la franja nueva. 409 `INVALID_TRANSITION` (ya decidida),
 * `APPOINTMENT_EXPIRED` (la franja propuesta ya pasó, D23) o `CONCURRENT_CHANGE`.
 */
export function approveReschedule(id: number): Promise<AdminAppointment> {
  return request(API_ROUTES.admin.approveReschedule(id), { method: 'POST' });
}

/** Rechaza una solicitud de reprogramación con motivo obligatorio (1–500). La cita no cambia. */
export function rejectReschedule(id: number, reason: string): Promise<AdminAppointment> {
  return request(API_ROUTES.admin.rejectReschedule(id), { method: 'POST', body: { reason } });
}

/* --------------------------------- S4 · EPS (HU-012) ---------------------- */

export function listEps(signal?: AbortSignal): Promise<Eps[]> {
  return request(API_ROUTES.admin.epsList, withSignal(signal));
}

/** Una EPS por id (aclaración 9 del contrato S4). 404 si no existe. */
export function getEps(id: number, signal?: AbortSignal): Promise<Eps> {
  return request(API_ROUTES.admin.eps(id), withSignal(signal));
}

/** 409 `DUPLICATE` con `field` = `code` o `name`. */
export function createEps(body: CreateEpsRequest): Promise<Eps> {
  return request(API_ROUTES.admin.epsList, { method: 'POST', body });
}

export function updateEps(id: number, body: UpdateEpsRequest): Promise<Eps> {
  return request(API_ROUTES.admin.eps(id), { method: 'PUT', body });
}

/** Desactivar la retira del catálogo público sin tocar las afiliaciones existentes. */
export function setEpsActive(id: number, active: boolean): Promise<Eps> {
  return request(API_ROUTES.admin.epsStatus(id), { method: 'PATCH', body: { active } });
}

/** 409 `EPS_REFERENCED` si tiene planes: la UI ofrece desactivarla (D28). */
export function deleteEps(id: number): Promise<void> {
  return request(API_ROUTES.admin.eps(id), { method: 'DELETE' });
}

export function listEpsPlans(epsId: number, signal?: AbortSignal): Promise<EpsPlan[]> {
  return request(API_ROUTES.admin.epsPlans(epsId), withSignal(signal));
}

/** 409 `DUPLICATE` (código o nombre dentro de la EPS); 400 si el régimen no existe. */
export function createEpsPlan(epsId: number, body: CreateEpsPlanRequest): Promise<EpsPlan> {
  return request(API_ROUTES.admin.epsPlans(epsId), { method: 'POST', body });
}

export function updateEpsPlan(id: number, body: UpdateEpsPlanRequest): Promise<EpsPlan> {
  return request(API_ROUTES.admin.epsPlan(id), { method: 'PUT', body });
}

export function setEpsPlanActive(id: number, active: boolean): Promise<EpsPlan> {
  return request(API_ROUTES.admin.epsPlanStatus(id), { method: 'PATCH', body: { active } });
}

/** 409 `PLAN_REFERENCED` si tiene afiliaciones: la UI ofrece desactivarlo (D28). */
export function deleteEpsPlan(id: number): Promise<void> {
  return request(API_ROUTES.admin.epsPlan(id), { method: 'DELETE' });
}
