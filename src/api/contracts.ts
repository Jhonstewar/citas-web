/**
 * CONTRATO REST — fuente única de verdad del frontend.
 *
 * Reconciliado el 2026-09-16 contra citas-api (GOAL_01: HU-001..004).
 * S3 (2026-09-18): catálogos, profesionales, agenda y citas según `contrato-rest-citas.md`
 * (Provisional: el backend de S3 se implementa en paralelo con el mismo contrato).
 * Ninguna ruta ni tipo de payload REST vive fuera de este archivo.
 * Errores: ProblemDetail (RFC 9457) con `detail`; los 400 añaden `fieldErrors`.
 * Pendiente: recuperación de contraseña (RF-03) aún no existe en el backend.
 */

/**
 * URL base del backend. Llega por variable de entorno Vite; nunca se hardcodea: si falta, la
 * aplicación falla al cargar con un mensaje claro en vez de apuntar en silencio a un host supuesto.
 * Todo lo que Vite inyecta en el bundle es PÚBLICO: aquí no van secretos.
 */
function resolveApiBaseUrl(): string {
  const url: string | undefined = import.meta.env.VITE_API_URL?.trim();
  if (!url) {
    throw new Error('Falta VITE_API_URL: copia citas-web/.env.example a citas-web/.env.');
  }
  return url.replace(/\/+$/, '');
}

export const API_BASE_URL: string = resolveApiBaseUrl();

/** Valor admitido en la cadena de consulta. `undefined`, `null` y `''` se omiten. */
export type QueryValue = string | number | boolean | null | undefined;

/**
 * Añade la cadena de consulta a una ruta. Vive aquí para que ningún componente construya URLs:
 * los módulos `*Api.ts` pasan un objeto de filtros y esta función decide cómo se codifica.
 */
export function withQuery(path: string, query: Readonly<Record<string, QueryValue>> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.append(key, String(value));
  }
  const search = params.toString();
  return search === '' ? path : `${path}?${search}`;
}

/** Rutas REST. Ver advertencia de reconciliación al inicio del archivo. */
export const API_ROUTES = {
  auth: {
    /** RF-01 · Registro de usuario. */
    register: '/api/auth/register',
    /** RF-02 · Login por email + contraseña. */
    login: '/api/auth/login',
    /** RF-02 · Renovación con rotación del refresh token. */
    refresh: '/api/auth/refresh',
    /** RF-02 · Logout: revoca la familia del refresh token. Responde 204. */
    logout: '/api/auth/logout',
    /** RF-03 · Solicitud de recuperación por email. ⚠️ Ruta supuesta. */
    passwordRecovery: '/api/auth/password-recovery',
  },
  /** Usuario autenticado y sus roles. */
  me: '/api/me',

  /** HU-010 · Catálogos fijos, cualquier rol autenticado. Solo lectura. */
  catalogs: {
    sites: '/api/catalogs/sites',
    /** Solo especialidades activas. */
    specialties: '/api/catalogs/specialties',
    appointmentTypes: '/api/catalogs/appointment-types',
    appointmentStatuses: '/api/catalogs/appointment-statuses',
    documentTypes: '/api/catalogs/document-types',
    roles: '/api/catalogs/roles',
    regimes: '/api/catalogs/regimes',
  },

  /** Rutas del ADMIN (HU-011, HU-013..016, HU-029, HU-030). */
  admin: {
    specialties: '/api/admin/specialties',
    specialty: (id: number) => `/api/admin/specialties/${id}`,
    specialtyStatus: (id: number) => `/api/admin/specialties/${id}/status`,
    professionals: '/api/admin/professionals',
    professional: (id: number) => `/api/admin/professionals/${id}`,
    professionalSpecialties: (id: number) => `/api/admin/professionals/${id}/specialties`,
    professionalSites: (id: number) => `/api/admin/professionals/${id}/sites`,
    professionalStatus: (id: number) => `/api/admin/professionals/${id}/status`,
    inbox: '/api/admin/inbox',
    appointment: (id: number) => `/api/admin/appointments/${id}`,
    approve: (id: number) => `/api/admin/appointments/${id}/approve`,
    reject: (id: number) => `/api/admin/appointments/${id}/reject`,
    summary: '/api/admin/summary',
  },

  /** Rutas del PROFESSIONAL (HU-017..019). El titular sale siempre del token. */
  professional: {
    me: '/api/professional/me',
    blocks: '/api/professional/blocks',
    block: (id: number) => `/api/professional/blocks/${id}`,
  },

  /** Rutas del USER (HU-022..025). */
  patient: {
    availability: '/api/patient/availability',
    availabilityDays: '/api/patient/availability/days',
    generalAppointment: '/api/patient/appointments/general',
    specializedAppointment: '/api/patient/appointments/specialized',
    appointments: '/api/patient/appointments',
    appointment: (id: number) => `/api/patient/appointments/${id}`,
  },
} as const;

/* -------------------------------------------------------------------------- */
/* Tipos de dominio compartidos con el backend                                */
/* -------------------------------------------------------------------------- */

/** Tipos de documento: mismos códigos que el seed V4 de citas-api. */
export const DOCUMENT_TYPES = [
  { code: 'CC', label: 'Cédula de ciudadanía' },
  { code: 'TI', label: 'Tarjeta de identidad' },
  { code: 'CE', label: 'Cédula de extranjería' },
  { code: 'PA', label: 'Pasaporte' },
  { code: 'RC', label: 'Registro civil' },
] as const;

export type DocumentTypeCode = (typeof DOCUMENT_TYPES)[number]['code'];

/** Roles del PRD §2. El frontend los muestra; no decide autorización con ellos. */
export type Role = 'USER' | 'PROFESSIONAL' | 'ADMIN';

/* -------------------------------------------------------------------------- */
/* Payloads de petición                                                       */
/* -------------------------------------------------------------------------- */

/** RF-01. `passwordConfirm` NO se envía: es validación de cliente únicamente. */
export interface RegisterRequest {
  firstNames: string;
  lastNames: string;
  documentType: DocumentTypeCode;
  documentNumber: string;
  email: string;
  phone: string;
  password: string;
}

/** RF-02. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** RF-03. */
export interface PasswordRecoveryRequest {
  email: string;
}

/** RF-02 · refresh y logout. */
export interface RefreshRequest {
  refreshToken: string;
}

/* -------------------------------------------------------------------------- */
/* Payloads de respuesta                                                      */
/* -------------------------------------------------------------------------- */

/** Respuesta de login y refresh. Los roles viajan en el claim `roles` del JWT y en /api/me. */
export interface AuthTokensResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  /** Segundos de vida del access token. */
  expiresIn: number;
}

/** Respuesta 201 del registro. No inicia sesión: HU-001 excluye el auto-login. */
export interface UserResponse {
  id: number;
  firstNames: string;
  lastNames: string;
  documentType: DocumentTypeCode;
  documentNumber: string;
  email: string;
  /** La columna admite NULL y el backend omite los nulos al serializar. */
  phone?: string;
  roles: Role[];
}

/**
 * Respuesta de recuperación de contraseña (RF-03).
 * En desarrollo el PRD permite exponer el token de forma controlada; por eso
 * `devToken` es opcional y solo se usa para depurar el laboratorio.
 */
export interface PasswordRecoveryResponse {
  message?: string;
  devToken?: string;
}

/* ========================================================================== */
/* S3 — Catálogos, profesionales, agenda y citas                              */
/* Fuente: citas-api/docs/wiki/llm-wiki/wiki/contrato-rest-citas.md           */
/* Fechas `2026-09-21` (ISO, sin zona) y horas `08:30`; zona America/Bogota.  */
/* ========================================================================== */

/** Fecha ISO sin zona, p. ej. `2026-09-21`. */
export type IsoDate = string;
/** Hora `HH:mm`, p. ej. `08:30`. */
export type HourMinute = string;

export type AppointmentType = 'GENERAL' | 'SPECIALIZED';
export type DurationMinutes = 30 | 60;

export type AppointmentStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW';

export type HistorySource = 'SYSTEM' | 'USER' | 'ADMIN' | 'PROFESSIONAL';

/** Códigos de la extensión `code` del ProblemDetail que la UI trata de forma específica. */
export const ERROR_CODES = {
  validation: 'VALIDATION',
  pastTime: 'PAST_TIME',
  notFound: 'NOT_FOUND',
  duplicate: 'DUPLICATE',
  slotTaken: 'SLOT_TAKEN',
  blockOverlap: 'BLOCK_OVERLAP',
  blockHasAppointments: 'BLOCK_HAS_APPOINTMENTS',
  invalidTransition: 'INVALID_TRANSITION',
  appointmentExpired: 'APPOINTMENT_EXPIRED',
  specialtyReferenced: 'SPECIALTY_REFERENCED',
  protectedSpecialty: 'PROTECTED_SPECIALTY',
  siteNotAssigned: 'SITE_NOT_ASSIGNED',
  specialtyInactive: 'SPECIALTY_INACTIVE',
  specialtyNotAssigned: 'SPECIALTY_NOT_ASSIGNED',
  professionalInactive: 'PROFESSIONAL_INACTIVE',
  wrongFlow: 'WRONG_FLOW',
  slotNotAvailable: 'SLOT_NOT_AVAILABLE',
} as const;

/** Longitud máxima del motivo de rechazo (HU-030). */
export const REJECTION_REASON_MAX = 500;
/** Rango máximo en días de las consultas por rango (bloques y días con oferta). */
export const MAX_RANGE_DAYS = 62;
/** Duraciones admitidas por especialidad (RF-09). */
export const ALLOWED_DURATIONS: readonly DurationMinutes[] = [30, 60];

/* ---------------------------- Tipos compartidos --------------------------- */

export interface SiteRef {
  id: number;
  code: string;
  name: string;
}

export interface Site extends SiteRef {
  address: string;
  city: string;
  department: string;
}

export interface SpecialtyRef {
  id: number;
  code: string;
  name: string;
  appointmentType: AppointmentType;
  durationMinutes: DurationMinutes;
}

export interface Specialty extends SpecialtyRef {
  requiresAdminApproval: boolean;
  active: boolean;
  /** Medicina General: no se desactiva ni cambia de tipo. */
  protected: boolean;
}

export interface ProfessionalRef {
  id: number;
  fullName: string;
}

export interface PatientRef {
  id: number;
  fullName: string;
  documentType: string;
  documentNumber: string;
  email: string;
  phone: string;
}

export interface ProfessionalSpecialty extends SpecialtyRef {
  primary: boolean;
}

export interface Professional {
  id: number;
  userId: number;
  firstNames: string;
  lastNames: string;
  fullName: string;
  documentType: string;
  documentNumber: string;
  email: string;
  phone: string;
  professionalCode: string;
  licenseNumber: string;
  active: boolean;
  specialties: ProfessionalSpecialty[];
  sites: SiteRef[];
}

export interface Slot {
  id: number;
  startTime: HourMinute;
  endTime: HourMinute;
  available: boolean;
}

export interface Block {
  id: number;
  date: IsoDate;
  startTime: HourMinute;
  endTime: HourMinute;
  site: SiteRef;
  /** `futuro && sin reservas`. */
  editable: boolean;
  slots: Slot[];
}

export interface Offer {
  professional: ProfessionalRef;
  site: SiteRef;
  specialty: SpecialtyRef;
  date: IsoDate;
  startTime: HourMinute;
  endTime: HourMinute;
  durationMinutes: DurationMinutes;
}

/**
 * Día con oferta de `GET /api/patient/availability/days`.
 * ⚠️ El contrato dice `{ date, offers }` sin precisar el tipo de `offers`: se asume el número de
 * franjas, pero se acepta también la lista de ofertas (ver `offerCount` en `patientApi`).
 */
export interface AvailabilityDay {
  date: IsoDate;
  offers: number | Offer[];
}

export interface Appointment {
  id: number;
  status: AppointmentStatus;
  statusName: string;
  date: IsoDate;
  startTime: HourMinute;
  endTime: HourMinute;
  durationMinutes: DurationMinutes;
  site: SiteRef;
  professional: ProfessionalRef;
  specialty: SpecialtyRef;
  /** Puede venir `null` o ausente (el backend omite nulos). */
  rejectionReason?: string | null;
  createdAt: string;
}

export interface HistoryEntry {
  status: AppointmentStatus;
  statusName: string;
  source: HistorySource;
  actorName?: string | null;
  reason?: string | null;
  changedAt: string;
}

export interface AppointmentDetail extends Appointment {
  history: HistoryEntry[];
}

export interface AdminAppointment extends AppointmentDetail {
  patient: PatientRef;
}

/* -------------------------------- Catálogos ------------------------------- */

export interface CatalogItem {
  code: string;
  name: string;
}

export interface AppointmentTypeItem {
  code: AppointmentType;
  name: string;
  requiresAdminApproval: boolean;
}

export interface AppointmentStatusItem {
  code: AppointmentStatus;
  name: string;
  terminal: boolean;
}

/* ------------------------------ ADMIN: payloads --------------------------- */

export interface CreateSpecialtyRequest {
  code: string;
  name: string;
  appointmentType: AppointmentType;
  durationMinutes: DurationMinutes;
}

export interface UpdateSpecialtyRequest {
  name: string;
  appointmentType: AppointmentType;
  durationMinutes: DurationMinutes;
}

export interface StatusRequest {
  active: boolean;
}

export interface ProfessionalFilters {
  active?: boolean | undefined;
  specialtyId?: number | undefined;
  siteId?: number | undefined;
}

export interface CreateProfessionalRequest {
  firstNames: string;
  lastNames: string;
  documentType: string;
  documentNumber: string;
  email: string;
  phone: string;
  /** Contraseña inicial fijada por el ADMIN (D6). Nunca vuelve en la respuesta. */
  password: string;
  professionalCode: string;
  licenseNumber: string;
  specialtyIds: number[];
  primarySpecialtyId: number;
  siteIds: number[];
}

/**
 * Edición de datos del profesional. El código profesional y la matrícula NO se editan tras el
 * alta (HU-013 los deja fuera de alcance, INC-015): la UI los muestra como solo lectura.
 */
export interface UpdateProfessionalRequest {
  firstNames: string;
  lastNames: string;
  phone: string;
}

export interface ProfessionalSpecialtiesRequest {
  specialtyIds: number[];
  primarySpecialtyId: number;
}

export interface ProfessionalSitesRequest {
  siteIds: number[];
}

export interface InboxFilters {
  siteId?: number | undefined;
  professionalId?: number | undefined;
  specialtyId?: number | undefined;
  date?: IsoDate | undefined;
}

/** En S4 llegará también `RESCHEDULE_REQUEST`. */
export interface InboxEntry {
  type: 'APPOINTMENT_REQUEST';
  appointment: AdminAppointment;
}

export interface RejectRequest {
  reason: string;
}

export interface AdminSummary {
  pendingRequests: number;
  activeProfessionals: number;
  activeSpecialties: number;
  appointmentsToday: number;
}

/* --------------------------- PROFESSIONAL: payloads ----------------------- */

export interface BlockRequest {
  siteId: number;
  date: IsoDate;
  startTime: HourMinute;
  endTime: HourMinute;
}

/* ------------------------------ USER: payloads ---------------------------- */

export interface AvailabilityQuery {
  specialtyId: number;
  date: IsoDate;
  siteId?: number | undefined;
  professionalId?: number | undefined;
}

export interface AvailabilityDaysQuery {
  specialtyId: number;
  from: IsoDate;
  to: IsoDate;
  siteId?: number | undefined;
  professionalId?: number | undefined;
}

/** La duración no viaja: la fija la especialidad (RF-09). */
export interface BookAppointmentRequest {
  professionalId: number;
  siteId: number;
  specialtyId: number;
  date: IsoDate;
  startTime: HourMinute;
}

export interface MyAppointmentsFilters {
  status?: AppointmentStatus | undefined;
  date?: IsoDate | undefined;
}
