import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useSession } from './useSession';

/**
 * Guarda de ruta: sin sesión redirige a /login y recuerda a dónde iba el
 * usuario para volver tras autenticarse.
 *
 * Esto es navegación, no autorización: la autorización real por rol y
 * ownership la decide el backend (PRD §8). El frontend solo evita mostrar
 * pantallas que no van a funcionar sin token.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useSession();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
