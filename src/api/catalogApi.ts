import { request } from './httpClient';
import {
  API_ROUTES,
  type AppointmentStatusItem,
  type AppointmentTypeItem,
  type CatalogItem,
  type InsurancePlan,
  type Site,
  type Specialty,
} from './contracts';

/**
 * HU-010 · Catálogos fijos, de solo lectura, para cualquier rol autenticado. Los selectores de
 * la UI se pueblan desde aquí (CA-08), no desde valores escritos en el código.
 */

type Signal = AbortSignal | undefined;

function get<T>(path: string, signal: Signal): Promise<T> {
  return request<T>(path, signal === undefined ? {} : { signal });
}

export function getSites(signal?: AbortSignal): Promise<Site[]> {
  return get(API_ROUTES.catalogs.sites, signal);
}

/** Solo especialidades activas. */
export function getActiveSpecialties(signal?: AbortSignal): Promise<Specialty[]> {
  return get(API_ROUTES.catalogs.specialties, signal);
}

export function getAppointmentTypes(signal?: AbortSignal): Promise<AppointmentTypeItem[]> {
  return get(API_ROUTES.catalogs.appointmentTypes, signal);
}

export function getAppointmentStatuses(signal?: AbortSignal): Promise<AppointmentStatusItem[]> {
  return get(API_ROUTES.catalogs.appointmentStatuses, signal);
}

export function getDocumentTypes(signal?: AbortSignal): Promise<CatalogItem[]> {
  return get(API_ROUTES.catalogs.documentTypes, signal);
}

/**
 * RF-01 · Planes de afiliación activos para el registro público.
 *
 * Es el ÚNICO catálogo que se pide SIN token: quien se registra todavía no tiene sesión. Por eso
 * usa `authenticated: false`, igual que las rutas públicas de auth: así no adjunta un Bearer
 * heredado de otra pestaña ni un 401 dispara el ciclo de renovación de sesión.
 *
 * La lista llega filtrada a planes activos y ordenada por el backend: no se filtra ni reordena.
 */
export function getInsurancePlans(signal?: AbortSignal): Promise<InsurancePlan[]> {
  return request<InsurancePlan[]>(API_ROUTES.catalogs.insurancePlans, {
    authenticated: false,
    ...(signal === undefined ? {} : { signal }),
  });
}
