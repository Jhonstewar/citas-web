import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { logout as logoutRequest, refresh as refreshRequest } from '../api/authApi';
import {
  setAccessTokenProvider,
  setSessionExpiredHandler,
  setSessionRefresher,
  setTokenStatusProvider,
} from '../api/httpClient';
import { SessionContext, type SessionContextValue } from './SessionContext';
import { createSessionManager } from './sessionManager';

/**
 * Contexto de sesión. La lógica vive en `sessionManager`; aquí solo se conecta
 * con React y con el cliente HTTP. React solo observa si hay sesión: el token
 * no entra en su estado, así que tampoco aparece en React DevTools.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(() =>
    createSessionManager({ refresh: refreshRequest, logout: logoutRequest }),
  );
  const isAuthenticated = useSyncExternalStore(manager.subscribe, manager.isAuthenticated);

  // El cliente HTTP lee el token desde aquí, pide la renovación ante un 401 y
  // avisa cuando un 401 ya no es recuperable.
  useEffect(() => {
    setAccessTokenProvider(manager.getAccessToken);
    setSessionRefresher(manager.refreshSession);
    setSessionExpiredHandler(manager.expire);
    setTokenStatusProvider(manager.tokenStatus);
    return () => {
      setAccessTokenProvider(() => null);
      setSessionRefresher(null);
      setSessionExpiredHandler(null);
      setTokenStatusProvider(null);
    };
  }, [manager]);

  const value = useMemo<SessionContextValue>(
    () => ({
      isAuthenticated,
      signIn: manager.signIn,
      signOut: manager.signOut,
      refreshSession: manager.refreshSession,
    }),
    [isAuthenticated, manager],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
