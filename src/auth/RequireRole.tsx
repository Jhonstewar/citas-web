import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import type { Role } from '../api/contracts';
import { ForbiddenPage } from '../pages/ForbiddenPage';
import { useCurrentUser } from './CurrentUserContext';
import { ROLE_HOME } from './roles';

/**
 * Guarda de rol (HU-005 CA-08): una ruta de otro rol no presenta la vista, sino la pantalla
 * "Sin permiso", y la sesión sigue abierta. Es navegación, no autorización: el backend responde
 * 403 igualmente si alguien llama a la API de otro rol.
 */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { hasRole } = useCurrentUser();
  if (!hasRole(role)) return <ForbiddenPage />;
  return <>{children}</>;
}

/** `/` lleva al inicio del rol de la sesión. */
export function RoleHomeRedirect() {
  const { primaryRole } = useCurrentUser();
  return <Navigate to={ROLE_HOME[primaryRole]} replace />;
}
