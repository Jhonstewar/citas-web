import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { logout as logoutRequest, refresh as refreshRequest } from '../api/authApi';
import type { AuthTokensResponse, Role } from '../api/contracts';
import { setAccessTokenProvider, setUnauthorizedHandler } from '../api/httpClient';
import { SessionContext, type SessionContextValue } from './SessionContext';

/**
 * Contexto de sesión.
 *
 * Los tokens se guardan EN MEMORIA (estado de React + ref), no en
 * `localStorage`: así no quedan expuestos a XSS ni persisten al cerrar la
 * pestaña. Consecuencia esperada y aceptada: recargar la página cierra la
 * sesión hasta que el backend ofrezca refresh token en cookie HttpOnly.
 */
const KNOWN_ROLES: readonly Role[] = ['USER', 'PROFESSIONAL', 'ADMIN'];

/**
 * Lee el claim `roles` del access token solo para decidir qué mostrar.
 * No verifica la firma: la autorización real la impone citas-api.
 */
function rolesFromAccessToken(token: string): Role[] {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const claims = JSON.parse(json) as { roles?: unknown };
    if (!Array.isArray(claims.roles)) return [];
    return claims.roles.filter((r): r is Role => KNOWN_ROLES.includes(r as Role));
  } catch {
    return [];
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);

  // Ref espejo del access token: el cliente HTTP debe poder leer el valor
  // vigente sin re-suscribirse en cada render.
  const accessTokenRef = useRef<string | null>(null);
  const refreshTokenRef = useRef<string | null>(null);

  const applyTokens = useCallback((tokens: AuthTokensResponse) => {
    accessTokenRef.current = tokens.accessToken;
    refreshTokenRef.current = tokens.refreshToken;
    setAccessToken(tokens.accessToken);
    setRoles(rolesFromAccessToken(tokens.accessToken));
  }, []);

  const signOut = useCallback(() => {
    const refreshToken = refreshTokenRef.current;
    if (refreshToken !== null && refreshToken !== '') {
      // Si la revocación falla, la sesión local se cierra igual.
      logoutRequest({ refreshToken }).catch(() => undefined);
    }
    accessTokenRef.current = null;
    refreshTokenRef.current = null;
    setAccessToken(null);
    setRoles([]);
  }, []);

  /**
   * Renovación del access token (RF-02).
   *
   * El endpoint existe y rota el token, pero aún no se invoca automáticamente.
   * Pendiente (S3): invocarla ante un 401 (en `setUnauthorizedHandler`) o con un
   * temporizador antes de la expiración del access token.
   */
  const refreshSession = useCallback(async (): Promise<boolean> => {
    const refreshToken = refreshTokenRef.current;
    if (refreshToken === null || refreshToken === '') return false;
    try {
      const tokens = await refreshRequest({ refreshToken });
      applyTokens(tokens);
      return true;
    } catch {
      signOut();
      return false;
    }
  }, [applyTokens, signOut]);

  // El cliente HTTP lee el token desde aquí y avisa de los 401.
  useEffect(() => {
    setAccessTokenProvider(() => accessTokenRef.current);
    setUnauthorizedHandler(() => {
      signOut();
    });
    return () => {
      setAccessTokenProvider(() => null);
      setUnauthorizedHandler(null);
    };
  }, [signOut]);

  const value = useMemo<SessionContextValue>(
    () => ({
      accessToken,
      roles,
      isAuthenticated: accessToken !== null,
      signIn: applyTokens,
      signOut,
      refreshSession,
    }),
    [accessToken, roles, applyTokens, signOut, refreshSession],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
