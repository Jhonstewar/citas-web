import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toApiError, type ApiError } from '../api/ApiError';
import { DOCUMENT_TYPES, type UserResponse } from '../api/contracts';
import { getCurrentUser } from '../api/userApi';
import { useSession } from '../auth/useSession';
import { FormAlert } from '../components/FormAlert';

type AccountState =
  | { status: 'loading' }
  | { status: 'ready'; user: UserResponse }
  | { status: 'error'; error: ApiError };

function documentLabel(user: UserResponse): string {
  const type = DOCUMENT_TYPES.find((candidate) => candidate.code === user.documentType);
  return `${type?.label ?? user.documentType} ${user.documentNumber}`;
}

/**
 * Placeholder de la ruta protegida `/`.
 *
 * S2 solo cubre autenticación. El dashboard real (PRD §6: home/dashboard USER)
 * se construye en las sesiones siguientes a partir del diseño aprobado en
 * Stitch. Aquí se demuestra que la sesión sirve para consultar un endpoint
 * protegido (HU-002 CA-09) y que el logout funciona.
 */
export function DashboardPlaceholderPage() {
  const { signOut } = useSession();
  const navigate = useNavigate();

  const [account, setAccount] = useState<AccountState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentUser(controller.signal)
      .then((user) => setAccount({ status: 'ready', user }))
      .catch((cause: unknown) => {
        // Al desmontar se aborta la petición: no es un error que mostrar.
        if (controller.signal.aborted) return;
        // Un 401 que no se pudo renovar ya cerró la sesión y `RequireAuth`
        // devuelve al login; el resto de fallos se muestran con reintento.
        setAccount({ status: 'error', error: toApiError(cause) });
      });
    return () => controller.abort();
  }, [attempt]);

  function handleRetry() {
    setAccount({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }

  function handleLogout() {
    signOut();
    void navigate('/login', { replace: true });
  }

  return (
    <div className="shell">
      <header className="shell__bar">
        <p className="shell__brand">
          <span className="shell__brand-mark" aria-hidden="true" />
          FCV Citas
        </p>
        <button type="button" className="button button--ghost" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </header>

      <main className="shell__main">
        <h1 className="shell__title">Sesión iniciada</h1>
        <p className="shell__lead">
          La autenticación está funcionando. Las pantallas de agendamiento se implementan a
          partir del diseño aprobado en Stitch.
        </p>

        <section className="panel" aria-labelledby="panel-cuenta" aria-busy={account.status === 'loading'}>
          <h2 className="panel__title" id="panel-cuenta">
            Tu cuenta
          </h2>
          {account.status === 'loading' ? (
            <p role="status">Consultando tu cuenta…</p>
          ) : null}
          {account.status === 'error' ? (
            <FormAlert tone="error" title={account.error.message}>
              <button type="button" className="button button--ghost" onClick={handleRetry}>
                Reintentar
              </button>
            </FormAlert>
          ) : null}
          {account.status === 'ready' ? <AccountDetails user={account.user} /> : null}
        </section>

        <section className="panel" aria-labelledby="panel-pendiente">
          <h2 className="panel__title" id="panel-pendiente">
            Pendiente en esta ruta
          </h2>
          <ul className="panel__bullets">
            <li>Próxima cita y accesos rápidos del USER (PRD §6, RF-13).</li>
            <li>Buscar disponibilidad y solicitar cita (RF-10, RF-11, RF-12).</li>
            <li>Dashboards de PROFESSIONAL y ADMIN con sus propias rutas.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

/** Datos devueltos por `GET /api/me`, tal como los entrega el backend. */
function AccountDetails({ user }: { user: UserResponse }) {
  return (
    <dl className="panel__list">
      <div className="panel__row">
        <dt>Nombre</dt>
        <dd>
          {user.firstNames} {user.lastNames}
        </dd>
      </div>
      <div className="panel__row">
        <dt>Correo</dt>
        <dd>{user.email}</dd>
      </div>
      <div className="panel__row">
        <dt>Documento</dt>
        <dd>{documentLabel(user)}</dd>
      </div>
      <div className="panel__row">
        <dt>Roles</dt>
        <dd>{user.roles.join(', ')}</dd>
      </div>
    </dl>
  );
}
