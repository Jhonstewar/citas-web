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
/* Suministro del access token                                                */
/* -------------------------------------------------------------------------- */

/**
 * El token vive en memoria dentro del contexto de sesión; el cliente HTTP solo
 * lo consulta a través de este proveedor, para no duplicar el estado de sesión
 * ni crear una dependencia circular con React.
 */
let accessTokenProvider: () => string | null = () => null;
let unauthorizedHandler: (() => void) | null = null;

export function setAccessTokenProvider(provider: () => string | null): void {
  accessTokenProvider = provider;
}

/** Se invoca ante un 401 para que la sesión se cierre en un solo lugar. */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
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

/**
 * Extrae el mensaje legible del cuerpo de error.
 *
 * RECONCILIAR: se cubren las formas habituales de Spring Boot (`message`,
 * `detail` de RFC 7807, `error`). Cuando citas-api fije su formato de error,
 * recortar esta función a esa forma.
 */
function extractMessage(payload: unknown): string | null {
  if (typeof payload === 'string' && payload.trim() !== '') return payload.trim();
  if (!isRecord(payload)) return null;
  const keys = ['message', 'detail', 'error_description', 'error'] as const;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

/**
 * Extrae errores por campo de la validación server-side.
 *
 * RECONCILIAR: se aceptan `fieldErrors: { campo: mensaje }`, el array `errors:
 * [{ field, defaultMessage }]` de Spring y `violations: [{ field, message }]`.
 */
function extractFieldErrors(payload: unknown): FieldErrors {
  if (!isRecord(payload)) return {};
  const result: Record<string, string> = {};

  const direct = payload.fieldErrors;
  if (isRecord(direct)) {
    for (const [field, message] of Object.entries(direct)) {
      if (typeof message === 'string') result[field] = message;
    }
  }

  const listKeys = ['errors', 'violations'] as const;
  for (const key of listKeys) {
    const list = payload[key];
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!isRecord(item)) continue;
      const field = item.field ?? item.propertyPath ?? item.name;
      const message = item.defaultMessage ?? item.message ?? item.error;
      if (typeof field === 'string' && typeof message === 'string') {
        result[field] = message;
      }
    }
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
  const { method = 'GET', body, authenticated = true, signal } = options;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  if (authenticated) {
    const token = accessTokenProvider();
    if (token !== null && token !== '') {
      headers.Authorization = `Bearer ${token}`;
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

  const payload = await readBody(response);
  const kind = kindForStatus(response.status);

  if (kind === 'session') unauthorizedHandler?.();

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
