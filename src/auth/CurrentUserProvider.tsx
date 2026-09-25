import { useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { getCurrentUser } from '../api/userApi';
import { ErrorState } from '../components/ErrorState';
import { Skeleton } from '../components/Skeleton';
import { useResource } from '../lib/useResource';
import { CurrentUserContext, type CurrentUserValue } from './CurrentUserContext';
import { primaryRole } from './roles';
import { useSession } from './useSession';

/**
 * Pide `GET /api/me` una vez por sesión y comparte el usuario y sus roles con el resto de la
 * aplicación. Los roles salen de la respuesta del backend, no de decodificar el JWT.
 */
export function CurrentUserProvider({ children }: { children: ReactNode }) {
  const me = useResource((signal) => getCurrentUser(signal), []);
  const { update } = me;
  const { signOut } = useSession();
  const navigate = useNavigate();

  const value = useMemo<CurrentUserValue | null>(() => {
    if (me.state.status !== 'ready') return null;
    const user = me.state.data;
    const roles = user.roles;
    const role = primaryRole(roles);
    if (role === null) return null;
    return {
      user,
      roles,
      primaryRole: role,
      hasRole: (candidate) => roles.includes(candidate),
      fullName: `${user.firstNames} ${user.lastNames}`.trim(),
      replaceUser: (next) => update(() => next),
    };
  }, [me.state, update]);

  function handleLogout() {
    signOut();
    void navigate('/login', { replace: true });
  }

  if (me.state.status === 'loading') {
    // También aquí se puede salir: si `/api/me` tarda (p. ej. renovando la sesión), el usuario
    // no queda atrapado en la pantalla de carga.
    return (
      <main className="boot">
        <div role="status" aria-live="polite" className="stack">
          <span className="visually-hidden">Cargando tu cuenta…</span>
          <Skeleton variant="block" />
          <Skeleton variant="text" lines={3} />
        </div>
        <button type="button" className="button button--ghost" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </main>
    );
  }

  if (me.state.status === 'error' || value === null) {
    return (
      <main className="boot">
        <ErrorState
          error={me.state.status === 'error' ? me.state.error : null}
          title="No pudimos cargar tu cuenta"
          fallbackMessage="Tu cuenta no tiene un rol reconocido por la aplicación."
          onRetry={me.state.status === 'error' ? () => me.reload() : undefined}
        />
        <button type="button" className="button button--ghost" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </main>
    );
  }

  return <CurrentUserContext value={value}>{children}</CurrentUserContext>;
}
