/**
 * CONTRATO REST — fuente única de verdad del frontend.
 *
 * Reconciliado el 2026-09-16 contra citas-api (GOAL_01: HU-001..004).
 * Ninguna ruta ni tipo de payload REST vive fuera de este archivo.
 * Errores: ProblemDetail (RFC 7807) con `detail`; los 400 añaden `fieldErrors`.
 * Pendiente: recuperación de contraseña (RF-03) aún no existe en el backend.
 */

/**
 * URL base del backend. Llega por variable de entorno Vite; nunca se hardcodea.
 * Todo lo que Vite inyecta en el bundle es PÚBLICO: aquí no van secretos.
 */
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_URL ?? 'http://localhost:8080'
).replace(/\/+$/, '');

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
  phone: string;
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
