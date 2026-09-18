import type { Role } from '../api/contracts';

/**
 * Navegación por rol (HU-005 CA-08). Esto decide qué pantallas se ofrecen, no qué se autoriza:
 * la autorización real la aplica el backend en cada petición (`/api/admin/**` → ADMIN, etc.).
 */

export const ROLE_HOME: Readonly<Record<Role, string>> = {
  USER: '/paciente',
  PROFESSIONAL: '/profesional',
  ADMIN: '/admin',
};

export const ROLE_LABEL: Readonly<Record<Role, string>> = {
  USER: 'Paciente',
  PROFESSIONAL: 'Profesional',
  ADMIN: 'Administrador',
};

/** Si una cuenta tuviera varios roles, entra por el de mayor alcance. */
const PRIORITY: readonly Role[] = ['ADMIN', 'PROFESSIONAL', 'USER'];

export function primaryRole(roles: readonly Role[]): Role | null {
  return PRIORITY.find((role) => roles.includes(role)) ?? null;
}

/** Rol dueño de una ruta según su prefijo, o `null` si la ruta es común. */
export function roleForPath(pathname: string): Role | null {
  for (const [role, home] of Object.entries(ROLE_HOME) as [Role, string][]) {
    if (pathname === home || pathname.startsWith(`${home}/`)) return role;
  }
  return null;
}
