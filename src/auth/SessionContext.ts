import { createContext } from 'react';
import type { AuthTokensResponse, Role } from '../api/contracts';

/** Estado de sesión expuesto a la aplicación. */
export interface SessionState {
  /** Access token JWT. Vive SOLO en memoria (ver `SessionProvider`). */
  accessToken: string | null;
  /** Roles conocidos del usuario. El frontend los muestra; no autoriza con ellos. */
  roles: Role[];
  isAuthenticated: boolean;
}

export interface SessionContextValue extends SessionState {
  /** Registra los tokens devueltos por login/registro. */
  signIn: (tokens: AuthTokensResponse) => void;
  /** Limpia la sesión en memoria. */
  signOut: () => void;
  /**
   * Renueva el access token usando el refresh token.
   * Devuelve `true` si la sesión quedó renovada.
   */
  refreshSession: () => Promise<boolean>;
}

export const SessionContext = createContext<SessionContextValue | null>(null);
