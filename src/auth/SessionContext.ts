import { createContext } from 'react';
import type { ApiError } from '../api/ApiError';
import type { AuthTokensResponse } from '../api/contracts';
import type { SessionStatus } from './sessionManager';

/**
 * Estado de sesión expuesto a la aplicación.
 *
 * Los tokens no se exponen: el access token vive solo en `sessionManager` y el cliente HTTP lo
 * lee de ahí; el refresh token vive en una cookie `HttpOnly` que JavaScript no ve (D36). Los
 * datos y roles del usuario se piden a `GET /api/me`, que es la fuente verificada; el frontend
 * no decodifica el JWT para mostrarlos.
 */
export interface SessionState {
  /**
   * `checking` mientras el arranque comprueba si la cookie aún da sesión (F5): las guardas de
   * ruta esperan en vez de mandar al login.
   */
  status: SessionStatus;
  /** Atajo de `status === 'authenticated'`. */
  isAuthenticated: boolean;
  /**
   * Error del arranque cuando el servidor no dio veredicto (red caída, 5xx): solo en el estado
   * `unavailable`. Las guardas lo muestran con "Reintentar" en vez de mandar al login.
   */
  restoreFailure: ApiError | null;
}

export interface SessionContextValue extends SessionState {
  /** Registra los tokens devueltos por el login. */
  signIn: (tokens: AuthTokensResponse) => void;
  /** Cierra la sesión local y pide al servidor revocar el refresh token de la cookie. */
  signOut: () => void;
  /**
   * Renueva el access token con la cookie del refresh token.
   * `true` si la sesión quedó renovada, `false` si fue rechazada; lanza si no
   * hubo respuesta del servidor.
   */
  refreshSession: () => Promise<boolean>;
  /** Vuelve a comprobar la sesión tras un arranque sin veredicto (`unavailable`). */
  retryRestore: () => Promise<void>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);
