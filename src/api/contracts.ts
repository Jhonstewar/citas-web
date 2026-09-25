/**
 * CONTRATO REST — fuente única de verdad del frontend.
 *
 * Reconciliado el 2026-09-16 contra citas-api (GOAL_01: HU-001..004).
 * S3 (2026-09-18): catálogos, profesionales, agenda y citas según `contrato-rest-citas.md`
 * (Vigente). Fechas y horas LocalDateTime sin zona, en hora de America/Bogota.
 * Ninguna ruta ni tipo de payload REST vive fuera de este archivo.
 * S4 (2026-09-25): ciclo de vida de la cita, agenda del profesional, EPS, perfil, afiliación y
 * recuperación de contraseña, según las secciones "S4" de `contrato-rest-citas.md` y
 * `contrato-rest-identidad.md` (acordadas antes de implementar el backend).
 * Errores: ProblemDetail (RFC 9457) con `detail`; los 400 añaden `fieldErrors`.
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
    /**
     * RF-02 · Renovación con rotación del refresh token. Sin cuerpo (D36): el refresh token
     * viaja en la cookie `HttpOnly` `fcv_refresh`, que el servidor rota en cada 200 y borra en
     * el 401.
     */
    refresh: '/api/auth/refresh',
    /**
     * RF-02 · Logout: revoca la familia del refresh token de la cookie `fcv_refresh` y la borra.
     * Sin cuerpo (D36); 204 siempre (idempotente).
     */
    logout: '/api/auth/logout',
    /** RF-03 · HU-006 · Solicitud de recuperación por email. Pública; responde 202. */
    passwordRecovery: '/api/auth/password-recovery',
    /** RF-03 · HU-007 · Restablece la contraseña con el token de un solo uso. Pública; 204. */
    passwordReset: '/api/auth/password-reset',
  },
  /** Usuario autenticado y sus roles (GET) · HU-008 edición del perfil propio (PUT). */
  me: '/api/me',
  /** HU-009 · Afiliación vigente del USER: PUT la fija o cambia, DELETE la cierra. */
  meAffiliation: '/api/me/affiliation',

  /** HU-010 · Catálogos fijos, cualquier rol autenticado. Solo lectura. */
  catalogs: {
    sites: '/api/catalogs/sites',
    /** Solo especialidades activas. */
    specialties: '/api/catalogs/specialties',
    appointmentTypes: '/api/catalogs/appointment-types',
    appointmentStatuses: '/api/catalogs/appointment-statuses',
    /** Estados de una solicitud de reprogramación (incluye `PENDING`, HU-010 CA-04). */
    rescheduleStatuses: '/api/catalogs/reschedule-statuses',
    documentTypes: '/api/catalogs/document-types',
    roles: '/api/catalogs/roles',
    regimes: '/api/catalogs/regimes',
    /**
     * RF-01 · Planes de afiliación activos. ÚNICO catálogo PÚBLICO: el registro no tiene sesión,
     * así que esta lectura no lleva token ni participa del ciclo de renovación.
     * El backend ya los devuelve filtrados a activos y ordenados: el cliente no filtra ni reordena.
     */
    insurancePlans: '/api/catalogs/insurance-plans',
  },

  /** Rutas del ADMIN (HU-011, HU-012, HU-013..016, HU-029..031). */
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
    /** HU-031 · Decisión sobre una solicitud de reprogramación (el id es el de la solicitud). */
    approveReschedule: (id: number) => `/api/admin/reschedules/${id}/approve`,
    rejectReschedule: (id: number) => `/api/admin/reschedules/${id}/reject`,
    /** HU-012 · EPS y sus planes. */
    epsList: '/api/admin/eps',
    eps: (id: number) => `/api/admin/eps/${id}`,
    epsStatus: (id: number) => `/api/admin/eps/${id}/status`,
    epsPlans: (epsId: number) => `/api/admin/eps/${epsId}/plans`,
    epsPlan: (id: number) => `/api/admin/eps-plans/${id}`,
    epsPlanStatus: (id: number) => `/api/admin/eps-plans/${id}/status`,
  },

  /** Rutas del PROFESSIONAL (HU-017..021). El titular sale siempre del token. */
  professional: {
    me: '/api/professional/me',
    blocks: '/api/professional/blocks',
    block: (id: number) => `/api/professional/blocks/${id}`,
    /** HU-020 · Citas `APPROVED` propias en un rango (`from`, `to`; `siteId` opcional). */
    appointments: '/api/professional/appointments',
    /** HU-021 · Cierre de la atención. */
    completeAppointment: (id: number) => `/api/professional/appointments/${id}/complete`,
    noShowAppointment: (id: number) => `/api/professional/appointments/${id}/no-show`,
  },

  /** Rutas del USER (HU-022..028). */
  patient: {
    availability: '/api/patient/availability',
    availabilityDays: '/api/patient/availability/days',
    generalAppointment: '/api/patient/appointments/general',
    specializedAppointment: '/api/patient/appointments/specialized',
    appointments: '/api/patient/appointments',
    appointment: (id: number) => `/api/patient/appointments/${id}`,
    /** HU-026 · Cancelación por el paciente. */
    cancelAppointment: (id: number) => `/api/patient/appointments/${id}/cancel`,
    /** HU-027 · Solicitud de reprogramación. */
    rescheduleAppointment: (id: number) => `/api/patient/appointments/${id}/reschedule`,
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
  /**
   * RF-01 · Plan de afiliación, OPCIONAL. La clave se omite cuando el usuario no elige plan:
   * no se envía `null` ni cadena vacía. Si el plan dejó de estar disponible, el backend responde
   * 422 con `code = INSURANCE_PLAN_UNAVAILABLE`.
   */
  insurancePlanId?: number;
}

/** RF-02. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** RF-03 · HU-006. */
export interface PasswordRecoveryRequest {
  email: string;
}

/**
 * RF-03 · HU-007. El token llega al frontend por `/restablecer-password?token=…`.
 * La contraseña nueva sigue la política D29 (`validatePasswordPolicy` en `validation/`).
 */
export interface PasswordResetRequest {
  token: string;
  newPassword: string;
}

/* -------------------------------------------------------------------------- */
/* Payloads de respuesta                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Respuesta de login y refresh. Los roles viajan en el claim `roles` del JWT y en /api/me.
 *
 * Desde D36 NO trae `refreshToken`: el servidor lo entrega en la cookie `HttpOnly`
 * `fcv_refresh` (`Path=/api/auth`), que JavaScript no puede leer. `refresh` y `logout` no llevan
 * cuerpo: el navegador adjunta la cookie cuando la petición va con `credentials: 'include'`.
 */
export interface AuthTokensResponse {
  accessToken: string;
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
  /**
   * S4 · HU-009 · Afiliación vigente. Aditivo: `null` (u omitido, por `non_null`) sin afiliación y
   * siempre en ADMIN y PROFESSIONAL.
   */
  affiliation?: Affiliation | null;
}

/**
 * Respuesta 202 de `POST /api/auth/password-recovery` (HU-006). `message` es idéntico exista o
 * no el email. `devToken` solo llega con la exposición de laboratorio activa
 * (`PASSWORD_RESET_EXPOSE_TOKEN=true`, D27) y solo para un email existente. Nunca se registra.
 */
export interface PasswordRecoveryResponse {
  message: string;
  devToken?: string;
}

/**
 * HU-008 · Campos editables del perfil propio (D25). Enviar `email`, `documentType`,
 * `documentNumber`, `password` o `roles` da 400 `FIELD_NOT_EDITABLE` con `field`.
 */
export interface UpdateProfileRequest {
  firstNames: string;
  lastNames: string;
  phone: string;
}

/** HU-009 · Fija o cambia el plan vigente (D26). Mismo plan = sin cambios. */
export interface AffiliationRequest {
  insurancePlanId: number;
}

/** HU-009 · Afiliación vigente; `plan` tiene el mismo cuerpo que el catálogo público. */
export interface Affiliation {
  id: number;
  plan: InsurancePlan;
  startedOn: IsoDate;
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
  /** RF-01 · El plan de afiliación elegido en el registro ya no está disponible (422). */
  insurancePlanUnavailable: 'INSURANCE_PLAN_UNAVAILABLE',
  /** 409 · Otra transacción cambió los datos a la vez; se puede reintentar. */
  concurrentChange: 'CONCURRENT_CHANGE',
  /** S4 · 409 · Cerrar como COMPLETED/NO_SHOW antes de la hora de inicio (D19). */
  appointmentNotStarted: 'APPOINTMENT_NOT_STARTED',
  /** S4 · 409 · Ya hay una reprogramación PENDING sobre la cita (D20). */
  reschedulePending: 'RESCHEDULE_PENDING',
  /** S4 · 409 · Borrar una EPS con planes (D28). */
  epsReferenced: 'EPS_REFERENCED',
  /** S4 · 409 · Borrar un plan con afiliaciones (D28). */
  planReferenced: 'PLAN_REFERENCED',
  /** S4 · 422 · La franja propuesta es la misma que la actual. */
  sameSlot: 'SAME_SLOT',
  /** S4 · 400 · `PUT /api/me` con un campo no editable; la extensión `field` lo nombra (D25). */
  fieldNotEditable: 'FIELD_NOT_EDITABLE',
  /** S4 · 400 · Token de restablecimiento inexistente, caducado, usado o revocado (una sola respuesta). */
  resetTokenInvalid: 'RESET_TOKEN_INVALID', // secret-scan:allow código de error del contrato, no una credencial
} as const;

/** Longitud máxima del motivo de rechazo (HU-030, y rechazo de reprogramación HU-031). */
export const REJECTION_REASON_MAX = 500;
/** Longitud máxima del motivo opcional de cancelación (HU-026). */
export const CANCELLATION_REASON_MAX = 500;
/** Longitud máxima del motivo opcional al pedir una reprogramación (HU-027, aclaración 3 del contrato S4). */
export const RESCHEDULE_REASON_MAX = 500;
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
  /** Omitido si es nulo (el backend usa `non_null` y guarda null si llega en blanco). */
  phone?: string;
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
  /** Omitido si es nulo (el backend usa `non_null` y guarda null si llega en blanco). */
  phone?: string;
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

/** Día con oferta de `GET /api/patient/availability/days`: `offers` es el número de franjas. */
export interface AvailabilityDay {
  date: IsoDate;
  offers: number;
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
  /** S4 · Hay una solicitud de reprogramación `PENDING` sobre la cita. */
  pendingReschedule: boolean;
  /**
   * S4 · Futura y no terminal (D16, D17). Viene también en el listado (aclaración 8 del contrato
   * S4) para ofrecer "Cancelar" solo cuando el servidor lo admite. Lo decide el backend; la UI
   * solo lo refleja.
   */
  cancellable: boolean;
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
  /**
   * S4 · HU-028 · La solicitud de reprogramación más reciente, en cualquier estado. `null` u
   * omitida (`non_null`) si nunca hubo una.
   */
  lastReschedule?: RescheduleRequest | null;
  /** S4 · `APPROVED`, futura y sin reprogramación `PENDING` (D20). */
  reschedulable: boolean;
}

/**
 * Cita vista por el ADMIN. `lastReschedule` llega por herencia del detalle; el contrato también
 * lo declara explícitamente aquí.
 */
export interface AdminAppointment extends AppointmentDetail {
  patient: PatientRef;
}

/* ------------------------------ S4 · Reprogramación ----------------------- */

export type RescheduleStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

/** Franja concreta de una cita: fecha, horas y sede (la sede puede cambiar, D21). */
export interface TimeSlot {
  date: IsoDate;
  startTime: HourMinute;
  endTime: HourMinute;
  site: SiteRef;
}

export interface RescheduleRequest {
  id: number;
  appointmentId: number;
  status: RescheduleStatus;
  statusName: string;
  /** Franja de la cita en el momento de pedirla. */
  previous: TimeSlot;
  /** Franja pedida. */
  proposed: TimeSlot;
  requestReason?: string | null;
  decisionReason?: string | null;
  createdAt: string;
  decidedAt?: string | null;
}

/**
 * HU-027 · Profesional y especialidad se conservan: el cuerpo no los lleva. `reason` es opcional
 * y la clave se omite si el paciente no escribe nada.
 */
export interface RescheduleAppointmentRequest {
  siteId: number;
  date: IsoDate;
  startTime: HourMinute;
  reason?: string;
}

/** HU-026 · Motivo opcional (≤ 500). La clave se omite si el paciente no escribe nada. */
export interface CancelAppointmentRequest {
  reason?: string;
}

/* ------------------------------ S4 · Profesional -------------------------- */

/** Datos mínimos del paciente para el profesional (RF-16): sin email ni teléfono. */
export interface ProfessionalPatientRef {
  fullName: string;
  documentType: string;
  documentNumber: string;
}

/** HU-020 · Cita de la agenda del profesional (el listado solo trae `APPROVED`). */
export interface ProfessionalAppointment {
  id: number;
  status: AppointmentStatus;
  statusName: string;
  date: IsoDate;
  startTime: HourMinute;
  endTime: HourMinute;
  durationMinutes: DurationMinutes;
  site: SiteRef;
  specialty: SpecialtyRef;
  patient: ProfessionalPatientRef;
  /** `APPROVED` y ya empezó (D19): habilita COMPLETED / NO_SHOW. */
  closable: boolean;
}

/** HU-020 · `from`/`to` obligatorios (máx. 62 días; un día = `from` igual a `to`). */
export interface ProfessionalAppointmentsQuery {
  from: IsoDate;
  to: IsoDate;
  siteId?: number | undefined;
}

/* --------------------------------- S4 · EPS ------------------------------- */

/** HU-012 · EPS administrable (activas e inactivas). */
export interface Eps {
  id: number;
  code: string;
  name: string;
  active: boolean;
  planCount: number;
}

/**
 * HU-012 · Plan de una EPS. El régimen es `{ id, code, name }`, igual que en `InsurancePlan`
 * (aclaración 4 del contrato S4); el alta y la edición siguen enviando `regimeCode`.
 */
export interface EpsPlan {
  id: number;
  epsId: number;
  code: string;
  name: string;
  active: boolean;
  regime: InsuranceRef;
}

export interface CreateEpsRequest {
  code: string;
  name: string;
}

/** El contrato solo admite editar el nombre. */
export interface UpdateEpsRequest {
  name: string;
}

export interface CreateEpsPlanRequest {
  code: string;
  name: string;
  regimeCode: string;
}

export interface UpdateEpsPlanRequest {
  name: string;
  regimeCode: string;
}

/* -------------------------------- Catálogos ------------------------------- */

export interface CatalogItem {
  code: string;
  name: string;
}

/** Referencia con identificador de los catálogos de afiliación (plan, EPS y régimen). */
export interface InsuranceRef {
  id: number;
  code: string;
  name: string;
}

/**
 * RF-01 · Plan de afiliación con su EPS y su régimen. El backend entrega la lista ya filtrada a
 * planes activos y en el orden definitivo: el cliente no filtra ni reordena.
 */
export interface InsurancePlan extends InsuranceRef {
  eps: InsuranceRef;
  regime: InsuranceRef;
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

export interface RescheduleStatusItem {
  code: RescheduleStatus;
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

export type InboxEntryType = 'APPOINTMENT_REQUEST' | 'RESCHEDULE_REQUEST';

/**
 * Filtros de la bandeja. En una reprogramación, `date` y `siteId` se aplican a la franja
 * PROPUESTA (D24).
 */
export interface InboxFilters {
  siteId?: number | undefined;
  professionalId?: number | undefined;
  specialtyId?: number | undefined;
  date?: IsoDate | undefined;
  type?: InboxEntryType | undefined;
}

export interface AppointmentRequestInboxEntry {
  type: 'APPOINTMENT_REQUEST';
  appointment: AdminAppointment;
}

export interface RescheduleRequestInboxEntry {
  type: 'RESCHEDULE_REQUEST';
  appointment: AdminAppointment;
  reschedule: RescheduleRequest;
}

/** Unión discriminada por `type`: la UI distingue la entrada con `entry.type`. */
export type InboxEntry = AppointmentRequestInboxEntry | RescheduleRequestInboxEntry;

export interface RejectRequest {
  reason: string;
}

export interface AdminSummary {
  pendingRequests: number;
  activeProfessionals: number;
  activeSpecialties: number;
  appointmentsToday: number;
  /** S4 · Solicitudes de reprogramación `PENDING`. */
  pendingReschedules: number;
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
