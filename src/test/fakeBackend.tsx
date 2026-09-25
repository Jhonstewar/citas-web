import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, vi } from 'vitest';
import { App } from '../App';
import {
  ERROR_CODES,
  type AdminAppointment,
  type Affiliation,
  type AppointmentDetail,
  type AppointmentStatus,
  type AuthTokensResponse,
  type Eps,
  type EpsPlan,
  type HourMinute,
  type InboxEntry,
  type InsuranceRef,
  type InsurancePlan,
  type ProfessionalAppointment,
  type RescheduleRequest,
  type Role,
  type SiteRef,
  type SpecialtyRef,
  type TimeSlot,
  type UserResponse,
} from '../api/contracts';

/**
 * Backend simulado para las pruebas de pantallas de S3: se sustituye `fetch` y cada ruta
 * responde según un guion. Una petición fuera del guion falla como error de red, y queda
 * registrada para poder afirmarlo.
 *
 * Refresh token en cookie (D36): la aplicación intenta restaurar la sesión al arrancar con
 * `POST /api/auth/refresh`. Si el guion no dice nada de esa ruta, responde 401 como el servidor
 * real cuando no hay cookie (`NO_REFRESH_COOKIE`); para simular un F5 con cookie válida, el guion
 * la incluye con un 200 (ver `restoredSessionScript`).
 */

export interface Call {
  method: string;
  path: string;
  query: Record<string, string>;
  authorization: string | undefined;
  /** `credentials` de la petición: `'include'` en las rutas de sesión (cookie del refresh). */
  credentials: RequestCredentials | undefined;
  body: unknown;
  /** Segmentos capturados por una clave con patrón (`:id`); vacío con una clave exacta. */
  params: Record<string, string>;
}

export type Reply = Response | ((call: Call) => Response | Promise<Response>);

/**
 * Guion por ruta (`'GET /api/me'`). Una lista se consume en orden (la última respuesta se repite
 * si se agota); una función responde siempre. Una clave puede llevar segmentos con patrón
 * (`'POST /api/admin/eps/:id/plans'`); la clave exacta gana siempre sobre la de patrón.
 */
export type Script = Record<string, Reply | Reply[]>;

/** Busca la clave con patrón que casa con `method path` y devuelve sus parámetros. */
function matchPattern(
  keys: Iterable<string>,
  method: string,
  path: string,
): { key: string; params: Record<string, string> } | null {
  const segments = path.split('/');
  for (const key of keys) {
    const [keyMethod, keyPath] = key.split(' ');
    if (keyMethod !== method || keyPath === undefined || !keyPath.includes('/:')) continue;
    const pattern = keyPath.split('/');
    if (pattern.length !== segments.length) continue;
    const params: Record<string, string> = {};
    const matches = pattern.every((part, index) => {
      const segment = segments[index] ?? '';
      if (part.startsWith(':')) {
        params[part.slice(1)] = decodeURIComponent(segment);
        return segment !== '';
      }
      return part === segment;
    });
    if (matches) return { key, params };
  }
  return null;
}

export function json(status: number, body: unknown = null): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function problem(
  status: number,
  detail: string,
  extra: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify({ title: 'Error', status, detail, ...extra }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204 });
}

export function tokens(n: number): AuthTokensResponse {
  return {
    accessToken: `access-${n}`,
    tokenType: 'Bearer',
    expiresIn: 900,
  };
}

export function userWith(role: Role, overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    firstNames: role === 'USER' ? 'Laura' : role === 'PROFESSIONAL' ? 'Andrés' : 'Marta',
    lastNames: role === 'USER' ? 'Gómez' : role === 'PROFESSIONAL' ? 'Rincón' : 'Ruiz',
    documentType: 'CC',
    documentNumber: '1001',
    email: 'persona@fcv.test',
    phone: '3001234567',
    roles: [role],
    ...overrides,
  };
}

/** Ruta de renovación: la aplicación la llama al arrancar para restaurar la sesión (D36). */
export const REFRESH_ROUTE = 'POST /api/auth/refresh';

/** Respuesta del servidor real a `refresh` sin cookie (o con una inválida): 401 y cookie borrada. */
export function noRefreshCookie(): Response {
  return problem(401, 'La sesión no es válida o ha expirado');
}

/** Llamadas hechas por la aplicación y no por el arranque: descarta la restauración inicial. */
export function withoutBootRefresh(calls: Call[]): Call[] {
  const first = calls.findIndex((call) => `${call.method} ${call.path}` === REFRESH_ROUTE);
  return first === -1 ? calls : calls.filter((_, index) => index !== first);
}

export function installBackend(script: Script): Call[] {
  const calls: Call[] = [];
  const queues = new Map<string, Reply[]>();
  // Sin cookie por defecto: el arranque encuentra "sin sesión", como un navegador limpio.
  if (!(REFRESH_ROUTE in script)) queues.set(REFRESH_ROUTE, [noRefreshCookie()]);
  for (const [key, value] of Object.entries(script)) {
    queues.set(key, Array.isArray(value) ? [...value] : [value]);
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const parsed = new URL(url);
      const method = init.method ?? 'GET';
      const headers = (init.headers ?? {}) as Record<string, string>;
      const call: Call = {
        method,
        path: parsed.pathname,
        query: Object.fromEntries(parsed.searchParams.entries()),
        authorization: headers.Authorization,
        credentials: init.credentials,
        body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
        params: {},
      };
      calls.push(call);
      let queue = queues.get(`${method} ${parsed.pathname}`);
      if (queue === undefined) {
        const match = matchPattern(queues.keys(), method, parsed.pathname);
        if (match !== null) {
          queue = queues.get(match.key);
          call.params = match.params;
        }
      }
      if (queue === undefined || queue.length === 0) {
        throw new Error(`Petición fuera del guion: ${method} ${parsed.pathname}`);
      }
      if (queue.length > 1) {
        const next = queue.shift() as Reply;
        return typeof next === 'function' ? next(call) : next;
      }
      // La última respuesta se repite: un Response solo se lee una vez, así que se clona.
      const last = queue[0] as Reply;
      return typeof last === 'function' ? last(call) : last.clone();
    }),
  );
  return calls;
}

/** Lleva la aplicación a `path` como si el usuario escribiera la URL. */
export function goTo(path: string) {
  act(() => {
    window.history.pushState(null, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

/**
 * Inicia sesión por el formulario real y espera a que el marco muestre al usuario.
 * El guion debe incluir `POST /api/auth/login` y `GET /api/me`.
 */
export async function renderLoggedIn(fullName: string, path?: string) {
  window.history.replaceState(null, '', '/login');
  const view = render(<App />);
  fireEvent.change(screen.getByLabelText(/Correo electrónico/), {
    target: { value: 'persona@fcv.test' },
  });
  fireEvent.change(screen.getByLabelText(/Contraseña/), { target: { value: 'Clave-Secreta#2026' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await screen.findByText(fullName);
  // Espera a que "/" termine de redirigir al inicio del rol; si no, esa redirección podría
  // llegar después de `goTo` y pisar la ruta pedida.
  await waitFor(() => {
    expect(['/', '/login']).not.toContain(window.location.pathname);
  });
  if (path !== undefined) goTo(path);
  return view;
}

/** Guion base de sesión para un rol. */
export function sessionScript(role: Role, overrides: Record<string, unknown> = {}): Script {
  return {
    'POST /api/auth/login': json(200, tokens(1)),
    'GET /api/me': json(200, userWith(role, overrides)),
    'POST /api/auth/logout': noContent(),
  };
}

/**
 * Guion de un F5 con la cookie del refresh token aún válida: el arranque renueva (200) y la
 * sesión continúa sin pasar por el login. Las renovaciones siguientes también responden 200.
 */
export function restoredSessionScript(role: Role, overrides: Record<string, unknown> = {}): Script {
  return {
    [REFRESH_ROUTE]: json(200, tokens(1)),
    'GET /api/me': json(200, userWith(role, overrides)),
    'POST /api/auth/logout': noContent(),
  };
}

/**
 * Simula recargar la página (F5) en `path`: la memoria de JavaScript se pierde (se monta una
 * aplicación nueva, con un gestor de sesión nuevo) y solo sobrevive lo que guarda el navegador.
 */
export function renderAfterReload(path: string) {
  window.history.replaceState(null, '', path);
  return render(<App />);
}

/* ========================================================================== */
/* S4 — fixtures y manejadores de los endpoints nuevos                        */
/* Comportamiento mínimo coherente con las secciones S4 del contrato          */
/* (`contrato-rest-citas.md`, `contrato-rest-identidad.md`). No es el backend: */
/* no decide reglas de negocio reales; reproduce respuestas y los códigos de  */
/* error principales para que las pantallas puedan probarse.                  */
/* ========================================================================== */

export const SITE_HIC: SiteRef = { id: 1, code: 'HIC', name: 'Hospital Internacional de Colombia' };
export const SITE_ICV: SiteRef = { id: 2, code: 'ICV', name: 'Instituto del Corazón' };

export const SPECIALTY_CARDIO: SpecialtyRef = {
  id: 2,
  code: 'CARDIOLOGIA',
  name: 'Cardiología',
  appointmentType: 'SPECIALIZED',
  durationMinutes: 60,
};

const STATUS_NAMES: Record<AppointmentStatus, string> = {
  REQUESTED: 'Solicitada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Atendida',
  NO_SHOW: 'No asistió',
};

const TERMINAL: readonly AppointmentStatus[] = ['REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'];

function addMinutes(time: HourMinute, minutes: number): HourMinute {
  const [hours = 0, mins = 0] = time.split(':').map(Number);
  const total = hours * 60 + mins + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function bodyOf(call: Call): Record<string, unknown> {
  return isRecord(call.body) ? call.body : {};
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function coded(status: number, code: string, detail: string, extra: Record<string, unknown> = {}) {
  return problem(status, detail, { code, ...extra });
}

function validation(fieldErrors: Record<string, string>): Response {
  return coded(400, ERROR_CODES.validation, 'La petición contiene campos inválidos', { fieldErrors });
}

/** Cita futura `APPROVED`, cancelable y reprogramable, en el detalle del paciente. */
export function appointmentDetail(overrides: Partial<AppointmentDetail> = {}): AppointmentDetail {
  return {
    id: 100,
    status: 'APPROVED',
    statusName: STATUS_NAMES.APPROVED,
    date: '2099-10-01',
    startTime: '09:00',
    endTime: '10:00',
    durationMinutes: 60,
    site: SITE_ICV,
    professional: { id: 10, fullName: 'Andrés Rincón' },
    specialty: SPECIALTY_CARDIO,
    createdAt: '2099-09-20T10:00:00',
    pendingReschedule: false,
    history: [],
    cancellable: true,
    reschedulable: true,
    ...overrides,
  };
}

export function adminAppointment(overrides: Partial<AdminAppointment> = {}): AdminAppointment {
  return {
    ...appointmentDetail(),
    patient: {
      id: 5,
      fullName: 'Laura Gómez',
      documentType: 'CC',
      documentNumber: '1001',
      email: 'laura@fcv.test',
      phone: '3001234567',
    },
    ...overrides,
  };
}

export function timeSlot(overrides: Partial<TimeSlot> = {}): TimeSlot {
  return { date: '2099-10-01', startTime: '09:00', endTime: '10:00', site: SITE_ICV, ...overrides };
}

export function rescheduleRequest(overrides: Partial<RescheduleRequest> = {}): RescheduleRequest {
  return {
    id: 500,
    appointmentId: 100,
    status: 'PENDING',
    statusName: 'Pendiente',
    previous: timeSlot(),
    proposed: timeSlot({ date: '2099-10-08', site: SITE_HIC }),
    createdAt: '2099-09-25T08:00:00',
    ...overrides,
  };
}

export function professionalAppointment(
  overrides: Partial<ProfessionalAppointment> = {},
): ProfessionalAppointment {
  return {
    id: 100,
    status: 'APPROVED',
    statusName: STATUS_NAMES.APPROVED,
    date: '2099-10-01',
    startTime: '09:00',
    endTime: '10:00',
    durationMinutes: 60,
    site: SITE_ICV,
    specialty: SPECIALTY_CARDIO,
    patient: { fullName: 'Laura Gómez', documentType: 'CC', documentNumber: '1001' },
    closable: false,
    ...overrides,
  };
}

/**
 * Regímenes. Llevan `id` porque el `EpsPlan` los emite así (aclaración 4 del contrato S4); el
 * catálogo `/api/catalogs/regimes` devuelve `{ code, name }` y el `id` sobrante no estorba.
 */
export const REGIMES: InsuranceRef[] = [
  { id: 1, code: 'CONTRIBUTIVO', name: 'Régimen contributivo' },
  { id: 2, code: 'SUBSIDIADO', name: 'Régimen subsidiado' },
];

export function eps(overrides: Partial<Eps> = {}): Eps {
  return { id: 1, code: 'EPS_DEMO', name: 'EPS de prueba', active: true, planCount: 0, ...overrides };
}

export function epsPlan(overrides: Partial<EpsPlan> = {}): EpsPlan {
  return {
    id: 3,
    epsId: 1,
    code: 'CONTRIB_BASICO',
    name: 'Plan básico',
    active: true,
    regime: { id: 1, code: 'CONTRIBUTIVO', name: 'Régimen contributivo' },
    ...overrides,
  };
}

export function insurancePlan(overrides: Partial<InsurancePlan> = {}): InsurancePlan {
  return {
    id: 3,
    code: 'CONTRIB_BASICO',
    name: 'Plan básico',
    eps: { id: 1, code: 'EPS_DEMO', name: 'EPS de prueba' },
    regime: { id: 1, code: 'CONTRIBUTIVO', name: 'Régimen contributivo' },
    ...overrides,
  };
}

export function affiliation(overrides: Partial<Affiliation> = {}): Affiliation {
  return { id: 1, plan: insurancePlan(), startedOn: '2099-01-01', ...overrides };
}

/* ------------------------- Paciente: cancelar y reprogramar --------------- */

/**
 * HU-026/HU-027 sobre una cita, con estado: tras cancelar, el `GET` del detalle devuelve la cita
 * cancelada. Errores: 409 `INVALID_TRANSITION` (terminal / no `APPROVED`), `APPOINTMENT_EXPIRED`
 * (ya no cancelable o reprogramable por tiempo), `RESCHEDULE_PENDING`; 422 `SAME_SLOT`;
 * 400 motivo de más de 500.
 */
export function patientLifecycleScript(initial: AppointmentDetail): Script {
  let detail = initial;
  const base = `/api/patient/appointments/${initial.id}`;
  return {
    [`GET ${base}`]: () => json(200, detail),
    [`POST ${base}/cancel`]: (call) => {
      const reason = text(bodyOf(call).reason);
      if (reason.length > 500) {
        return validation({ reason: 'El motivo no puede superar 500 caracteres' });
      }
      if (TERMINAL.includes(detail.status)) {
        return coded(409, ERROR_CODES.invalidTransition, 'La cita ya no admite cambios');
      }
      if (!detail.cancellable) {
        return coded(409, ERROR_CODES.appointmentExpired, 'La cita ya empezó');
      }
      const last = detail.lastReschedule;
      detail = {
        ...detail,
        status: 'CANCELLED',
        statusName: STATUS_NAMES.CANCELLED,
        cancellable: false,
        reschedulable: false,
        pendingReschedule: false,
        // D18: la reprogramación PENDING se cancela con la cita.
        ...(last?.status === 'PENDING'
          ? { lastReschedule: { ...last, status: 'CANCELLED' as const, statusName: 'Cancelada' } }
          : {}),
        history: [
          ...detail.history,
          {
            status: 'CANCELLED',
            statusName: STATUS_NAMES.CANCELLED,
            source: 'USER',
            actorName: 'Laura Gómez',
            reason: reason === '' ? null : reason,
            changedAt: '2099-09-25T09:00:00',
          },
        ],
      };
      return json(200, detail);
    },
    [`POST ${base}/reschedule`]: (call) => {
      const body = bodyOf(call);
      if (detail.status !== 'APPROVED') {
        return coded(409, ERROR_CODES.invalidTransition, 'Solo se reprograma una cita aprobada');
      }
      if (detail.pendingReschedule) {
        return coded(409, ERROR_CODES.reschedulePending, 'La cita ya tiene una reprogramación pendiente');
      }
      if (!detail.reschedulable) {
        return coded(409, ERROR_CODES.appointmentExpired, 'La cita ya empezó');
      }
      const siteId = Number(body.siteId);
      const date = text(body.date);
      const startTime = text(body.startTime);
      if (date === '' || startTime === '' || !Number.isInteger(siteId)) {
        return validation({ siteId: 'Obligatorio', date: 'Obligatorio', startTime: 'Obligatorio' });
      }
      if (siteId === detail.site.id && date === detail.date && startTime === detail.startTime) {
        return coded(422, ERROR_CODES.sameSlot, 'La franja propuesta es la misma que la actual');
      }
      const reason = text(body.reason);
      const site = [SITE_HIC, SITE_ICV].find((candidate) => candidate.id === siteId) ?? detail.site;
      const created = rescheduleRequest({
        appointmentId: detail.id,
        previous: { date: detail.date, startTime: detail.startTime, endTime: detail.endTime, site: detail.site },
        proposed: { date, startTime, endTime: addMinutes(startTime, detail.durationMinutes), site },
        ...(reason === '' ? {} : { requestReason: reason }),
      });
      detail = { ...detail, pendingReschedule: true, reschedulable: false, lastReschedule: created };
      return json(201, created);
    },
  };
}

/* ------------------------ Profesional: agenda y cierre -------------------- */

/**
 * HU-020/HU-021, con estado. `GET` exige `from`/`to` y filtra por rango, sede y `APPROVED`.
 * Cerrar: 404 si no es suya, 409 `INVALID_TRANSITION` si no está `APPROVED`,
 * `APPOINTMENT_NOT_STARTED` si no es `closable`.
 */
export function professionalAppointmentsScript(initial: ProfessionalAppointment[]): Script {
  let appointments = [...initial];
  const close = (target: 'COMPLETED' | 'NO_SHOW') => (call: Call) => {
    const id = Number(call.params.id);
    const current = appointments.find((appointment) => appointment.id === id);
    if (current === undefined) return coded(404, ERROR_CODES.notFound, 'La cita no existe');
    if (current.status !== 'APPROVED') {
      return coded(409, ERROR_CODES.invalidTransition, 'La cita ya no está aprobada');
    }
    if (!current.closable) {
      return coded(409, ERROR_CODES.appointmentNotStarted, 'La cita todavía no ha empezado');
    }
    const closed = { ...current, status: target, statusName: STATUS_NAMES[target], closable: false };
    appointments = appointments.map((appointment) => (appointment.id === id ? closed : appointment));
    return json(200, closed);
  };
  return {
    'GET /api/professional/appointments': (call) => {
      const { from, to, siteId } = call.query;
      if (from === undefined || to === undefined) {
        return validation({ from: 'Obligatorio', to: 'Obligatorio' });
      }
      return json(
        200,
        appointments.filter(
          (appointment) =>
            appointment.status === 'APPROVED' &&
            appointment.date >= from &&
            appointment.date <= to &&
            (siteId === undefined || String(appointment.site.id) === siteId),
        ),
      );
    },
    'POST /api/professional/appointments/:id/complete': close('COMPLETED'),
    'POST /api/professional/appointments/:id/no-show': close('NO_SHOW'),
  };
}

/* ------------------------ ADMIN: bandeja con reprogramaciones ------------- */

/**
 * HU-029/HU-031, con estado. La bandeja filtra por `type`; en una reprogramación `date` y
 * `siteId` miran la franja propuesta (D24). Decidir: 404, 409 `INVALID_TRANSITION` si ya no está
 * `PENDING`, 400 sin motivo al rechazar. Aprobar mueve la cita a la franja propuesta.
 */
export function adminRescheduleScript(initial: InboxEntry[]): Script {
  let entries = [...initial];
  const decide = (approve: boolean) => (call: Call) => {
    const id = Number(call.params.id);
    const entry = entries.find(
      (candidate) => candidate.type === 'RESCHEDULE_REQUEST' && candidate.reschedule.id === id,
    );
    if (entry === undefined || entry.type !== 'RESCHEDULE_REQUEST') {
      return coded(404, ERROR_CODES.notFound, 'La solicitud no existe');
    }
    if (entry.reschedule.status !== 'PENDING') {
      return coded(409, ERROR_CODES.invalidTransition, 'La solicitud ya fue decidida');
    }
    const reason = text(bodyOf(call).reason);
    if (!approve && reason === '') return validation({ reason: 'El motivo es obligatorio' });
    if (reason.length > 500) return validation({ reason: 'El motivo no puede superar 500 caracteres' });
    const { proposed } = entry.reschedule;
    const decided: RescheduleRequest = {
      ...entry.reschedule,
      status: approve ? 'APPROVED' : 'REJECTED',
      statusName: approve ? 'Aprobada' : 'Rechazada',
      decidedAt: '2099-09-25T10:00:00',
      ...(approve ? {} : { decisionReason: reason }),
    };
    const moved = approve
      ? { date: proposed.date, startTime: proposed.startTime, endTime: proposed.endTime, site: proposed.site }
      : {};
    const appointment: AdminAppointment = {
      ...entry.appointment,
      ...moved,
      pendingReschedule: false,
      lastReschedule: decided,
    };
    // La solicitud decidida se conserva (un segundo intento da INVALID_TRANSITION), pero sale de
    // la bandeja, que solo lista lo PENDING.
    entries = entries.map((candidate) =>
      candidate === entry ? { ...entry, appointment, reschedule: decided } : candidate,
    );
    return json(200, appointment);
  };
  return {
    'GET /api/admin/inbox': (call) => {
      const { type, date, siteId } = call.query;
      return json(
        200,
        entries.filter((entry) => {
          if (entry.type === 'RESCHEDULE_REQUEST' && entry.reschedule.status !== 'PENDING') return false;
          if (type !== undefined && entry.type !== type) return false;
          const slot = entry.type === 'RESCHEDULE_REQUEST' ? entry.reschedule.proposed : entry.appointment;
          if (date !== undefined && slot.date !== date) return false;
          return siteId === undefined || String(slot.site.id) === siteId;
        }),
      );
    },
    'POST /api/admin/reschedules/:id/approve': decide(true),
    'POST /api/admin/reschedules/:id/reject': decide(false),
  };
}

/* ------------------------------ ADMIN: EPS y planes ----------------------- */

/**
 * HU-012, con estado. 409 `DUPLICATE` (+ `field`) por código o nombre; 409 `EPS_REFERENCED` al
 * borrar una EPS con planes; 409 `PLAN_REFERENCED` al borrar un plan de `referencedPlanIds`;
 * 400 si el régimen no existe; 404 si el id no existe.
 */
export function epsAdminScript(
  initialEps: Eps[],
  initialPlans: EpsPlan[] = [],
  referencedPlanIds: readonly number[] = [],
): Script {
  let epsList = [...initialEps];
  let plans = [...initialPlans];
  let nextId = 1000;
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const duplicate = (field: 'code' | 'name') =>
    coded(409, ERROR_CODES.duplicate, `Ya existe un registro con ese ${field === 'code' ? 'código' : 'nombre'}`, {
      field,
    });
  const notFound = () => coded(404, ERROR_CODES.notFound, 'No existe');
  const withCount = (item: Eps): Eps => ({
    ...item,
    planCount: plans.filter((plan) => plan.epsId === item.id).length,
  });
  const regimeOf = (code: string) => REGIMES.find((regime) => regime.code === code);
  const setEps = (id: number, change: (item: Eps) => Eps): Eps | undefined => {
    const current = epsList.find((item) => item.id === id);
    if (current === undefined) return undefined;
    const updated = change(current);
    epsList = epsList.map((item) => (item.id === id ? updated : item));
    return withCount(updated);
  };
  const setPlan = (id: number, change: (plan: EpsPlan) => EpsPlan): EpsPlan | undefined => {
    const current = plans.find((plan) => plan.id === id);
    if (current === undefined) return undefined;
    const updated = change(current);
    plans = plans.map((plan) => (plan.id === id ? updated : plan));
    return updated;
  };

  return {
    'GET /api/admin/eps': () => json(200, epsList.map(withCount)),
    'POST /api/admin/eps': (call) => {
      const code = text(bodyOf(call).code).toUpperCase();
      const name = text(bodyOf(call).name);
      if (code === '' || name === '') return validation({ code: 'Obligatorio', name: 'Obligatorio' });
      if (epsList.some((item) => same(item.code, code))) return duplicate('code');
      if (epsList.some((item) => same(item.name, name))) return duplicate('name');
      const created: Eps = { id: nextId++, code, name, active: true, planCount: 0 };
      epsList = [...epsList, created];
      return json(201, created);
    },
    // Aclaración 9 del contrato S4: 200 `Eps` · 404.
    'GET /api/admin/eps/:id': (call) => {
      const found = epsList.find((item) => item.id === Number(call.params.id));
      return found === undefined ? notFound() : json(200, withCount(found));
    },
    'PUT /api/admin/eps/:id': (call) => {
      const id = Number(call.params.id);
      const name = text(bodyOf(call).name);
      if (name === '') return validation({ name: 'Obligatorio' });
      if (epsList.some((item) => item.id !== id && same(item.name, name))) return duplicate('name');
      const updated = setEps(id, (item) => ({ ...item, name }));
      return updated === undefined ? notFound() : json(200, updated);
    },
    'PATCH /api/admin/eps/:id/status': (call) => {
      const active = bodyOf(call).active === true;
      const updated = setEps(Number(call.params.id), (item) => ({ ...item, active }));
      return updated === undefined ? notFound() : json(200, updated);
    },
    'DELETE /api/admin/eps/:id': (call) => {
      const id = Number(call.params.id);
      if (!epsList.some((item) => item.id === id)) return notFound();
      if (plans.some((plan) => plan.epsId === id)) {
        return coded(409, ERROR_CODES.epsReferenced, 'La EPS tiene planes: desactívala en su lugar');
      }
      epsList = epsList.filter((item) => item.id !== id);
      return noContent();
    },
    'GET /api/admin/eps/:id/plans': (call) => {
      const id = Number(call.params.id);
      if (!epsList.some((item) => item.id === id)) return notFound();
      return json(200, plans.filter((plan) => plan.epsId === id));
    },
    'POST /api/admin/eps/:id/plans': (call) => {
      const epsId = Number(call.params.id);
      if (!epsList.some((item) => item.id === epsId)) return notFound();
      const code = text(bodyOf(call).code).toUpperCase();
      const name = text(bodyOf(call).name);
      const regime = regimeOf(text(bodyOf(call).regimeCode));
      if (code === '' || name === '') return validation({ code: 'Obligatorio', name: 'Obligatorio' });
      if (regime === undefined) return validation({ regimeCode: 'El régimen no existe' });
      const siblings = plans.filter((plan) => plan.epsId === epsId);
      if (siblings.some((plan) => same(plan.code, code))) return duplicate('code');
      if (siblings.some((plan) => same(plan.name, name))) return duplicate('name');
      const created: EpsPlan = { id: nextId++, epsId, code, name, active: true, regime };
      plans = [...plans, created];
      return json(201, created);
    },
    'PUT /api/admin/eps-plans/:id': (call) => {
      const id = Number(call.params.id);
      const name = text(bodyOf(call).name);
      const regime = regimeOf(text(bodyOf(call).regimeCode));
      if (name === '') return validation({ name: 'Obligatorio' });
      if (regime === undefined) return validation({ regimeCode: 'El régimen no existe' });
      const current = plans.find((plan) => plan.id === id);
      const clash = plans.some(
        (plan) => plan.id !== id && plan.epsId === current?.epsId && same(plan.name, name),
      );
      if (clash) return duplicate('name');
      const updated = setPlan(id, (plan) => ({ ...plan, name, regime }));
      return updated === undefined ? notFound() : json(200, updated);
    },
    'PATCH /api/admin/eps-plans/:id/status': (call) => {
      const active = bodyOf(call).active === true;
      const updated = setPlan(Number(call.params.id), (plan) => ({ ...plan, active }));
      return updated === undefined ? notFound() : json(200, updated);
    },
    'DELETE /api/admin/eps-plans/:id': (call) => {
      const id = Number(call.params.id);
      if (!plans.some((plan) => plan.id === id)) return notFound();
      if (referencedPlanIds.includes(id)) {
        return coded(409, ERROR_CODES.planReferenced, 'El plan tiene afiliaciones: desactívalo en su lugar');
      }
      plans = plans.filter((plan) => plan.id !== id);
      return noContent();
    },
  };
}

/* ------------------------- Perfil y afiliación (HU-008/009) --------------- */

const NOT_EDITABLE = ['email', 'documentType', 'documentNumber', 'password', 'roles'] as const;

/**
 * `GET/PUT /api/me` y `PUT/DELETE /api/me/affiliation`, con estado. Sustituye al `GET /api/me`
 * de `sessionScript` si se esparce después. 400 `FIELD_NOT_EDITABLE` (+ `field`), 400 de
 * validación y 422 `INSURANCE_PLAN_UNAVAILABLE` si el plan no está en `availablePlans`.
 */
export function profileScript(
  initial: UserResponse,
  availablePlans: InsurancePlan[] = [insurancePlan()],
): Script {
  let user = initial;
  let nextAffiliationId = 900;
  return {
    'GET /api/me': () => json(200, user),
    'PUT /api/me': (call) => {
      const body = bodyOf(call);
      const forbidden = NOT_EDITABLE.find((field) => field in body);
      if (forbidden !== undefined) {
        return coded(400, ERROR_CODES.fieldNotEditable, 'Ese dato no se puede editar', { field: forbidden });
      }
      const firstNames = text(body.firstNames);
      const lastNames = text(body.lastNames);
      const phone = text(body.phone);
      const errors: Record<string, string> = {};
      if (firstNames === '') errors.firstNames = 'no debe estar vacío';
      if (lastNames === '') errors.lastNames = 'no debe estar vacío';
      if (phone === '') errors.phone = 'no debe estar vacío';
      if (Object.keys(errors).length > 0) return validation(errors);
      user = { ...user, firstNames, lastNames, phone };
      return json(200, user);
    },
    'PUT /api/me/affiliation': (call) => {
      const planId = Number(bodyOf(call).insurancePlanId);
      const plan = availablePlans.find((candidate) => candidate.id === planId);
      if (plan === undefined) {
        return coded(
          422,
          ERROR_CODES.insurancePlanUnavailable,
          'El plan de EPS seleccionado no está disponible',
        );
      }
      const current = user.affiliation;
      if (current !== undefined && current !== null && current.plan.id === planId) {
        return json(200, current);
      }
      const created = affiliation({ id: nextAffiliationId++, plan, startedOn: '2099-09-25' });
      user = { ...user, affiliation: created };
      return json(200, created);
    },
    'DELETE /api/me/affiliation': () => {
      user = { ...user, affiliation: null };
      return noContent();
    },
  };
}

/* ------------------------ Recuperación de contraseña (HU-006/007) --------- */

export interface PasswordScriptOptions {
  /** Token que el restablecimiento acepta una sola vez. */
  validToken: string;
  /** Emails existentes: solo a ellos se añade `devToken`, y solo con `exposeToken` (D27). */
  knownEmails?: readonly string[];
  exposeToken?: boolean;
}

export const RECOVERY_MESSAGE =
  'Si el correo está registrado, recibirás instrucciones para restablecer la contraseña.';

/**
 * `POST /api/auth/password-recovery` responde 202 con el mismo `message` exista o no el email.
 * `POST /api/auth/password-reset` responde 204 una sola vez por token, 400 `RESET_TOKEN_INVALID`
 * después o con otro token, y 400 de validación si la contraseña incumple D29.
 */
export function passwordScript(options: PasswordScriptOptions): Script {
  let used = false;
  return {
    'POST /api/auth/password-recovery': (call) => {
      const email = text(bodyOf(call).email);
      if (!/^[^\s@]+@[^\s@]+$/.test(email)) return validation({ email: 'debe ser un email válido' });
      const known = options.knownEmails?.includes(email) ?? false;
      return json(202, {
        message: RECOVERY_MESSAGE,
        ...(options.exposeToken === true && known ? { devToken: options.validToken } : {}),
      });
    },
    'POST /api/auth/password-reset': (call) => {
      const body = bodyOf(call);
      if (used || text(body.token) !== options.validToken) {
        return coded(400, ERROR_CODES.resetTokenInvalid, 'El enlace no es válido o ha caducado');
      }
      const password = typeof body.newPassword === 'string' ? body.newPassword : '';
      const policyOk =
        password.length >= 8 &&
        /\p{L}/u.test(password) &&
        /[0-9]/.test(password) &&
        new TextEncoder().encode(password).length <= 72;
      if (!policyOk) {
        return validation({
          newPassword: 'debe tener al menos 8 caracteres, una letra y un dígito, y no superar 72 bytes',
        });
      }
      used = true;
      return noContent();
    },
  };
}
