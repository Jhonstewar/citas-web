import { useContext } from 'react';
import { SessionContext, type SessionContextValue } from './SessionContext';

/** Acceso al contexto de sesión. Falla rápido si falta el provider. */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession debe usarse dentro de <SessionProvider>.');
  }
  return value;
}
