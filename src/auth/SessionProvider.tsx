import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import { logout as logoutRequest, refresh as refreshRequest } from '../api/authApi';
import {
  setAccessTokenProvider,
  setSessionExpiredHandler,
  setSessionRefresher,
  setTokenStatusProvider,
} from '../api/httpClient';
import { withRefreshLock } from './refreshLock';
import { SessionContext, type SessionContextValue } from './SessionContext';
import { createSessionManager } from './sessionManager';

/**
 * Contexto de sesión. La lógica vive en `sessionManager`; aquí solo se conecta
 * con React y con el cliente HTTP. React solo observa el estado de sesión: el
 * token no entra en su estado, así que tampoco aparece en React DevTools.
 *
 * Al montarse, intenta restaurar la sesión con la cookie del refresh token
 * (F5, D36). Mientras tanto el estado es `checking` y `RequireAuth` espera; si el servidor no
 * responde (red caída, 5xx) el estado es `unavailable` y `RequireAuth` ofrece reintentar.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(() =>
    createSessionManager({
      // Cada renovación, también la del arranque, toma el candado entre pestañas: dos pestañas
      // no pueden presentar a la vez la misma cookie (el servidor lo leería como reuso).
      refresh: () => withRefreshLock(refreshRequest),
      logout: logoutRequest,
    }),
  );
  const status = useSyncExternalStore(manager.subscribe, manager.getStatus);

  // El cliente HTTP lee el token desde aquí, pide la renovación ante un 401 y
  // avisa cuando un 401 ya no es recuperable. Luego se intenta restaurar la
  // sesión; `restore` es idempotente, así que el doble montaje de `StrictMode`
  // no lanza dos renovaciones.
  useEffect(() => {
    setAccessTokenProvider(manager.getAccessToken);
    setSessionRefresher(manager.refreshSession);
    setSessionExpiredHandler(manager.expire);
    setTokenStatusProvider(manager.tokenStatus);
    void manager.restore();
    return () => {
      setAccessTokenProvider(() => null);
      setSessionRefresher(null);
      setSessionExpiredHandler(null);
      setTokenStatusProvider(null);
    };
  }, [manager]);

  const value = useMemo<SessionContextValue>(
    () => ({
      status,
      isAuthenticated: status === 'authenticated',
      // Cambia a la vez que `status` (solo existe en `unavailable`), así que basta con él.
      restoreFailure: status === 'unavailable' ? manager.getRestoreFailure() : null,
      signIn: manager.signIn,
      signOut: manager.signOut,
      refreshSession: manager.refreshSession,
      retryRestore: manager.retryRestore,
    }),
    [status, manager],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
