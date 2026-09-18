import { API_BASE_URL } from './contracts';
import {
  ApiError,
  DEFAULT_MESSAGE_BY_KIND,
  type ApiErrorKind,
  type FieldErrors,
} from './ApiError';

/**
 * Cliente HTTP único del frontend.
 *
 * - Llama DIRECTAMENTE a la API REST de Spring Boot (sin Express, BFF ni proxy).
 * - Toma la URL base de `VITE_API_URL`.
 * - Adjunta `Authorization: Bearer <accessToken>` cuando hay sesión.
 * - Ante un 401 sobre una petición autenticada renueva la sesión y reintenta
 *   una sola vez (HU-003 CA-06); si la renovación es rechazada, cierra la
 *   sesión (HU-003 CA-07).
 * - Clasifica el resultado por código de estado en vez de colapsarlo en "Error".
 */

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  /** Cuerpo JSON. Se serializa aquí; los componentes no tocan `fetch`. */
  body?: unknown;
  /** Si es `true` adjunta el access token disponible. Por defecto `true`. */
  authenticated?: boolean;
  signal?: AbortSignal;
}

/* -------------------------------------------------------------------------- */
/* Suministro del access token y renovación                                   */
/* -------------------------------------------------------------------------- */

/**
 * El token vive en memoria dentro del contexto de sesión; el cliente HTTP solo
 * lo consulta a través de este proveedor, para no duplicar el estado de sesión
 * ni crear una dependencia circular con React.
 */
let accessTokenProvider: () => string | null = () => null;

/**
 * Renovador de sesión. Devuelve `true` si dejó un access token nuevo listo en
 * el proveedor y `false` si la renovación fue rechazada; lanza si no hubo
 * respuesta, y ese error se propaga sin cerrar la sesión. Lo instala
 * `SessionProvider`, que además garantiza que varias peticiones que fallan a
 * la vez compartan una única renovación en vuelo (DoD de HU-003).
 */
let sessionRefresher: (() => Promise<boolean>) | null = null;

/**
 * Se invoca con el access token que recibió un 401 ya no recuperable. Cierra
 * la sesión en un solo lugar, y solo si ese token sigue siendo el vigente.
 */
let sessionExpiredHandler: ((rejectedAccessToken: string) => void) | null = null;

/**
 * Relación de un access token con la sesión vigente:
 * - `current`: es el token actual;
 * - `renewed`: es de esta misma sesión, pero otra petición ya lo renovó;
 * - `foreign`: es de una sesión que ya se cerró (logout, o logout y login nuevo).
 */
export type TokenStatus = 'current' | 'renewed' | 'foreign';

/**
 * Sin sesión instalada solo se sabe si el token es el actual. Si ya no hay token, la sesión se
 * cerró; si hay otro, se asume que se renovó.
 */
function defaultTokenStatus(token: string): TokenStatus {
  const current = accessTokenProvider();
  if (current === token) return 'current';
  return current === null || current === '' ? 'foreign' : 'renewed';
}

let tokenStatusProvider: (token: string) => TokenStatus = defaultTokenStatus;

export function setAccessTokenProvider(provider: () => string | null): void {
  accessTokenProvider = provider;
}

export function setSessionRefresher(refresher: (() => Promise<boolean>) | null): void {
  sessionRefresher = refresher;
}

export function setSessionExpiredHandler(
  handler: ((rejectedAccessToken: string) => void) | null,
): void {
  sessionExpiredHandler = handler;
}

export function setTokenStatusProvider(provider: ((token: string) => TokenStatus) | null): void {
  tokenStatusProvider = provider ?? defaultTokenStatus;
}

/* -------------------------------------------------------------------------- */
/* Interpretación del error del servidor                                      */
/* -------------------------------------------------------------------------- */

function kindForStatus(status: number): ApiErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 401) return 'session';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status >= 500) return 'server';
  return 'unknown';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*
 * Todos los errores de citas-api, incluidos los 401/403 de la cadena de
 * seguridad, son `ProblemDetail` (RFC 9457): el mensaje legible va en `detail`
 * y los 400 de validación añaden `fieldErrors: { campo: mensaje }`.
 */

/** Extrae el mensaje legible (`detail`) del cuerpo de error. */
function extractMessage(payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const detail = payload.detail;
  return typeof detail === 'string' && detail.trim() !== '' ? detail.trim() : null;
}

/** Extrae `fieldErrors` de la validación server-side. */
function extractFieldErrors(payload: unknown): FieldErrors {
  if (!isRecord(payload) || !isRecord(payload.fieldErrors)) return {};
  const result: Record<string, string> = {};
  for (const [field, message] of Object.entries(payload.fieldErrors)) {
    if (typeof message === 'string') result[field] = message;
  }
  return result;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === '') return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/* -------------------------------------------------------------------------- */
/* Petición                                                                   */
/* -------------------------------------------------------------------------- */

export async function request<TResponse>(
  path: string,
  options: RequestOptions = {},
): Promise<TResponse> {
  return execute<TResponse>(path, options, true);
}

/**
 * Ejecuta la petición.
 *
 * `allowRefresh` vale `false` en el reintento que sigue a una renovación: así
 * un segundo 401 se propaga como sesión terminada en vez de encadenar
 * renovaciones indefinidamente.
 */
async function execute<TResponse>(
  path: string,
  options: RequestOptions,
  allowRefresh: boolean,
): Promise<TResponse> {
  const { method = 'GET', body, authenticated = true, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // Solo un 401 sobre una petición que SÍ llevaba token significa "el access
  // token expiró". Sin esta marca, el 401 de credenciales inválidas del login
  // dispararía una renovación que no tiene ningún sentido.
  let sentToken: string | null = null;
  if (authenticated) {
    const token = accessTokenProvider();
    if (token !== null && token !== '') {
      headers.Authorization = `Bearer ${token}`;
      sentToken = token;
    }
  }

  const init: RequestInit = { method, headers };
  if (body !== undefined) init.body = JSON.stringify(body);
  if (signal !== undefined) init.signal = signal;

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, init);
  } catch (cause) {
    // fetch solo rechaza por fallo de red, CORS o abort: nunca por código HTTP.
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('network', 0, DEFAULT_MESSAGE_BY_KIND.network);
  }

  if (response.ok) {
    if (response.status === 204) return undefined as TResponse;
    const payload = await readBody(response);
    return payload as TResponse;
  }

  // HU-003 CA-06 — renovación transparente. El cuerpo se vuelve a serializar
  // desde `options.body` en cada intento, así que el reintento no depende de un
  // stream ya consumido; por eso tampoco se lee el cuerpo del 401 antes de
  // decidir.
  if (response.status === 401 && sentToken !== null && allowRefresh && signal?.aborted !== true) {
    const status = tokenStatusProvider(sentToken);
    // Otra petición ya renovó mientras esta viajaba con el token anterior:
    // basta con reintentar, sin rotar otra vez el refresh token.
    if (status === 'renewed') return execute<TResponse>(path, options, false);
    // Solo se renueva la sesión que envió el token. El 401 de una sesión ya cerrada
    // (`foreign`) no se reintenta: se ejecutaría con la identidad de otra sesión.
    if (status === 'current' && sessionRefresher !== null && (await sessionRefresher())) {
      return execute<TResponse>(path, options, false);
    }
  }

  const payload = await readBody(response);
  const kind = kindForStatus(response.status);

  // HU-003 CA-07 — no se pudo renovar o la renovación fue rechazada: la sesión
  // termina aquí y `RequireAuth` devuelve al login.
  if (kind === 'session' && sentToken !== null) sessionExpiredHandler?.(sentToken);

  // El mensaje del servidor manda en 400/409: es el que explica el problema
  // real ("el email ya está registrado"). En 5xx no se expone tal cual porque
  // suele ser una traza interna.
  const serverMessage = extractMessage(payload);
  const message =
    kind === 'server' || serverMessage === null
      ? DEFAULT_MESSAGE_BY_KIND[kind]
      : serverMessage;

  throw new ApiError(kind, response.status, message, extractFieldErrors(payload));
}
