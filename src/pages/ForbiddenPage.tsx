import { ShieldX } from 'lucide-react';
import { Link } from 'react-router';
import { useCurrentUser } from '../auth/CurrentUserContext';
import { ROLE_HOME, ROLE_LABEL } from '../auth/roles';
import { EmptyState } from '../components/EmptyState';

/** Ruta de otro rol: se explica y se ofrece volver al inicio propio, sin cerrar la sesión. */
export function ForbiddenPage() {
  const { primaryRole } = useCurrentUser();
  return (
    <div className="page">
      <h1 className="visually-hidden">Sin permiso</h1>
      <EmptyState
        icon={<ShieldX size={36} />}
        title="Sin permiso para ver esta página"
        description={`Esta sección no está disponible para tu rol (${ROLE_LABEL[primaryRole]}). Tu sesión sigue abierta.`}
        action={
          <Link className="button button--primary button--link" to={ROLE_HOME[primaryRole]}>
            Ir a mi inicio
          </Link>
        }
      />
    </div>
  );
}
