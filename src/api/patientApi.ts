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
  type MyAppointmentsFilters,
  type Offer,
} from './contracts';

/** Reserva del USER (HU-022..025). */

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

/** Número de franjas de un día, tanto si el backend manda un número como una lista. */
export function offerCount(day: AvailabilityDay): number {
  return Array.isArray(day.offers) ? day.offers.length : Number(day.offers) || 0;
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
