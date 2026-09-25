import { createContext, useContext } from 'react';
import type { Role, UserResponse } from '../api/contracts';

/** Usuario verificado por `GET /api/me` para la sesión abierta. */
export interface CurrentUserValue {
  user: UserResponse;
  roles: readonly Role[];
  /** Rol con el que se entra (ADMIN > PROFESSIONAL > USER). */
  primaryRole: Role;
  hasRole: (role: Role) => boolean;
  fullName: string;
  /**
   * Sustituye el usuario de la sesión por la respuesta del servidor tras editar el perfil o la
   * afiliación (HU-008/009), para que el marco muestre ya el nombre nuevo. No inventa datos: solo
   * recibe lo que devolvió la API.
   */
  replaceUser: (user: UserResponse) => void;
}

export const CurrentUserContext = createContext<CurrentUserValue | null>(null);

export function useCurrentUser(): CurrentUserValue {
  const value = useContext(CurrentUserContext);
  if (value === null) {
    throw new Error('useCurrentUser debe usarse dentro de <CurrentUserProvider>.');
  }
  return value;
}
