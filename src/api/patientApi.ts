import { request } from './httpClient';
import {
  API_ROUTES,
  withQuery,
  type Appointment,
  type AppointmentDetail,
  type AppointmentType,
  type AvailabilityDay,
  type AvailabilityDaysQuery,
  type AvailabilityQuery,
  type BookAppointmentRequest,
  type CancelAppointmentRequest,
  type MyAppointmentsFilters,
  type Offer,
  type RescheduleAppointmentRequest,
  type RescheduleRequest,
} from './contracts';

/** Reserva y ciclo de vida de la cita del USER (HU-022..028). */

function withSignal(signal: AbortSignal | undefined) {
  return signal === undefined ? {} : { signal };
}

/** Franjas reservables de un día, ordenadas por hora. Buscar no retiene nada (HU-022 CA-08). */
export function searchAvailability(query: AvailabilityQuery, signal?: AbortSignal): Promise<Offer[]> {
  return request(withQuery(API_ROUTES.patient.availability, { ...query }), withSignal(signal));
}

/** Días con oferta dentro del rango (máximo 62 días). */
export function availabilityDays(
  query: AvailabilityDaysQuery,
  signal?: AbortSignal,
): Promise<AvailabilityDay[]> {
  return request(withQuery(API_ROUTES.patient.availabilityDays, { ...query }), withSignal(signal));
}

/** Número de franjas de un día. */
export function offerCount(day: AvailabilityDay): number {
  return Number.isFinite(day.offers) ? day.offers : 0;
}

/**
 * Reserva la franja por la ruta que corresponde al tipo de la especialidad: la general nace
 * `APPROVED` y la especializada `REQUESTED`. Si el tipo no casa, el backend responde 422
 * `WRONG_FLOW`: la decisión final nunca es del cliente.
 */
export function bookAppointment(
  type: AppointmentType,
  body: BookAppointmentRequest,
): Promise<Appointment> {
  const path =
    type === 'GENERAL'
      ? API_ROUTES.patient.generalAppointment
      : API_ROUTES.patient.specializedAppointment;
  return request(path, { method: 'POST', body });
}

export function listMyAppointments(
  filters: MyAppointmentsFilters = {},
  signal?: AbortSignal,
): Promise<Appointment[]> {
  return request(withQuery(API_ROUTES.patient.appointments, { ...filters }), withSignal(signal));
}

export function getMyAppointment(id: number, signal?: AbortSignal): Promise<AppointmentDetail> {
  return request(API_ROUTES.patient.appointment(id), withSignal(signal));
}

/* ------------------------- S4 · Ciclo de vida (HU-026..028) --------------- */

/**
 * HU-026 · Cancela la cita propia. El motivo es opcional: si llega vacío, la clave no viaja.
 * Errores esperables: 404, 409 `INVALID_TRANSITION` (ya terminal) o `APPOINTMENT_EXPIRED`
 * (ya empezó). Si había una reprogramación `PENDING`, el backend también la cancela (D18).
 */
export function cancelAppointment(id: number, reason?: string): Promise<AppointmentDetail> {
  const body: CancelAppointmentRequest = {};
  const trimmed = reason?.trim();
  if (trimmed !== undefined && trimmed !== '') body.reason = trimmed;
  return request(API_ROUTES.patient.cancelAppointment(id), { method: 'POST', body });
}

/**
 * HU-027 · Pide reprogramar la cita a otra franja (201 `PENDING`). La cita no cambia hasta que
 * el ADMIN decide. Profesional y especialidad se conservan: la franja nueva se busca con
 * `searchAvailability` filtrando por el `specialtyId` y el `professionalId` de la cita.
 * Errores esperables: 409 `INVALID_TRANSITION` / `RESCHEDULE_PENDING` / `APPOINTMENT_EXPIRED` /
 * `SLOT_TAKEN`; 422 `PAST_TIME` / `SAME_SLOT` / `SLOT_NOT_AVAILABLE` / `SITE_NOT_ASSIGNED` /
 * `PROFESSIONAL_INACTIVE` / `SPECIALTY_INACTIVE`.
 */
export function requestReschedule(
  id: number,
  proposal: RescheduleAppointmentRequest,
): Promise<RescheduleRequest> {
  const { reason, ...slot } = proposal;
  const trimmed = reason?.trim();
  const body: RescheduleAppointmentRequest =
    trimmed !== undefined && trimmed !== '' ? { ...slot, reason: trimmed } : slot;
  return request(API_ROUTES.patient.rescheduleAppointment(id), { method: 'POST', body });
}
