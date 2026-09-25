import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { ErrorState } from '../components/ErrorState';
import { LoadingSection } from '../components/Skeleton';
import { useSession } from './useSession';

/**
 * Guarda de ruta: sin sesión redirige a /login y recuerda a dónde iba el
 * usuario para volver tras autenticarse.
 *
 * Mientras el arranque comprueba si la cookie del refresh token aún da sesión
 * (F5, D36), muestra un estado de carga en lugar de decidir: si redirigiera ya,
 * toda ruta protegida recargada rebotaría al login.
 *
 * Si el arranque no obtuvo veredicto (API caída o 5xx, estado `unavailable`),
 * tampoco manda al login: no se sabe si hay sesión, y hacerlo pediría credenciales
 * a quien quizá ya las tiene. Muestra el error con "Reintentar". Solo el rechazo
 * explícito del servidor (401) deja el estado en `anonymous` y lleva al login.
 *
 * Esto es navegación, no autorización: la autorización real por rol y
 * ownership la decide el backend (PRD §8). El frontend solo evita mostrar
 * pantallas que no van a funcionar sin token.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, restoreFailure, retryRestore } = useSession();
  const location = useLocation();

  if (status === 'checking') {
    return (
      <main className="boot">
        <LoadingSection label="Comprobando tu sesión…" variant="block" count={1} />
      </main>
    );
  }
  if (status === 'unavailable') {
    return (
      <main className="boot">
        <ErrorState
          error={restoreFailure}
          title="No pudimos comprobar tu sesión"
          fallbackMessage="El servicio no responde en este momento. Inténtalo de nuevo en unos segundos."
          onRetry={() => void retryRestore()}
        />
      </main>
    );
  }
  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <>{children}</>;
}
