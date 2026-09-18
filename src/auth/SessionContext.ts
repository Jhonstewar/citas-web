import { createContext } from 'react';
import type { AuthTokensResponse } from '../api/contracts';

/**
 * Estado de sesión expuesto a la aplicación.
 *
 * Los tokens no se exponen: viven solo en `sessionManager` y el cliente HTTP
 * los lee de ahí. Los datos y roles del usuario se piden a `GET /api/me`, que
 * es la fuente verificada; el frontend no decodifica el JWT para mostrarlos.
 */
export interface SessionState {
  isAuthenticated: boolean;
}

export interface SessionContextValue extends SessionState {
  /** Registra los tokens devueltos por el login. */
  signIn: (tokens: AuthTokensResponse) => void;
  /** Cierra la sesión local y revoca el refresh token en el servidor. */
  signOut: () => void;
  /**
   * Renueva el access token usando el refresh token.
   * `true` si la sesión quedó renovada, `false` si fue rechazada; lanza si no
   * hubo respuesta del servidor.
   */
  refreshSession: () => Promise<boolean>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);
