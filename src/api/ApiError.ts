/**
 * Error de API con la causa ya clasificada.
 *
 * El objetivo es que la UI NUNCA tenga que mostrar un genérico "Error":
 * cada código de estado relevante significa algo distinto para el usuario y
 * se traduce a un `kind` accionable.
 */
export type ApiErrorKind =
  /** 400/422 — la petición no pasó la validación del servidor. */
  | 'validation'
  /** 401 — no hay sesión o el access token expiró. */
  | 'session'
  /** 403 — hay sesión pero el rol/ownership no autoriza la operación. */
  | 'forbidden'
  /** 404 — el recurso no existe. */
  | 'not_found'
  /** 409 — conflicto de estado (email o documento ya registrados, slot tomado). */
  | 'conflict'
  /** 5xx — fallo del servidor. */
  | 'server'
  /** El backend no respondió (caído, CORS, sin red). */
  | 'network'
  /** Cualquier otra cosa inesperada. */
  | 'unknown';

/** Errores por campo devueltos por la validación server-side, si los hay. */
export type FieldErrors = Readonly<Record<string, string>>;

/**
 * Extensiones del ProblemDetail de S3 (`contrato-rest-citas`): `code` distingue causas con el
 * mismo estado HTTP (409 `SLOT_TAKEN` frente a `BLOCK_OVERLAP`) y `field` señala el campo de un
 * 409 `DUPLICATE`. La UI decide por `status` y `code`, nunca parseando `detail`.
 */
export interface ProblemExtensions {
  code?: string | undefined;
  field?: string | undefined;
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  /** 0 cuando no hubo respuesta HTTP (error de red). */
  readonly status: number;
  readonly fieldErrors: FieldErrors;
  /** Código estable del error (`SLOT_TAKEN`, `DUPLICATE`…), si el servidor lo envía. */
  readonly code: string | undefined;
  /** Campo en conflicto de un 409 `DUPLICATE`. */
  readonly field: string | undefined;

  constructor(
    kind: ApiErrorKind,
    status: number,
    message: string,
    fieldErrors: FieldErrors = {},
    extensions: ProblemExtensions = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.code = extensions.code;
    this.field = extensions.field;
  }
}

/** Mensajes por defecto cuando el servidor no aporta uno útil. */
export const DEFAULT_MESSAGE_BY_KIND: Readonly<Record<ApiErrorKind, string>> = {
  validation: 'Revisa los datos del formulario: el servidor los rechazó.',
  session: 'Tu sesión expiró o no es válida. Inicia sesión de nuevo.',
  forbidden: 'Tu cuenta no tiene permisos para realizar esta acción.',
  not_found: 'No encontramos el recurso solicitado.',
  conflict: 'Los datos entran en conflicto con información ya registrada.',
  server: 'El servidor tuvo un problema. Inténtalo de nuevo en unos minutos.',
  network:
    'No pudimos contactar al servidor. Verifica que la API esté disponible e inténtalo de nuevo.',
  unknown: 'Ocurrió un problema inesperado al procesar la solicitud.',
};

/** Normaliza cualquier excepción a `ApiError` para que la UI sepa qué mostrar. */
export function toApiError(cause: unknown): ApiError {
  if (cause instanceof ApiError) return cause;
  if (cause instanceof Error) {
    const message = cause.message === '' ? DEFAULT_MESSAGE_BY_KIND.unknown : cause.message;
    return new ApiError('unknown', 0, message);
  }
  return new ApiError('unknown', 0, DEFAULT_MESSAGE_BY_KIND.unknown);
}
