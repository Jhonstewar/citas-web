import { request } from './httpClient';
import {
  API_ROUTES,
  withQuery,
  type AdminAppointment,
  type AdminSummary,
  type CreateProfessionalRequest,
  type CreateSpecialtyRequest,
  type InboxEntry,
  type InboxFilters,
  type Professional,
  type ProfessionalFilters,
  type ProfessionalSitesRequest,
  type ProfessionalSpecialtiesRequest,
  type Specialty,
  type UpdateProfessionalRequest,
  type UpdateSpecialtyRequest,
} from './contracts';

/** Operaciones del ADMIN (HU-011, HU-013..016, HU-029, HU-030). */

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
