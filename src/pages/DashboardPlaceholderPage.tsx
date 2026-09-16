import { useNavigate } from 'react-router';
import { useSession } from '../auth/useSession';

/**
 * Placeholder de la ruta protegida `/`.
 *
 * S2 solo cubre autenticación. El dashboard real (PRD §6: home/dashboard USER)
 * se construye en las sesiones siguientes a partir del diseño aprobado en
 * Stitch. Aquí solo se demuestra que la sesión existe y que el logout funciona.
 */
export function DashboardPlaceholderPage() {
  const { roles, signOut } = useSession();
  const navigate = useNavigate();

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

        <section className="panel" aria-labelledby="panel-sesion">
          <h2 className="panel__title" id="panel-sesion">
            Estado de la sesión
          </h2>
          <dl className="panel__list">
            <div className="panel__row">
              <dt>Roles reportados por el backend</dt>
              <dd>
                {roles.length > 0
                  ? roles.join(', ')
                  : 'Sin roles en el token.'}
              </dd>
            </div>
            <div className="panel__row">
              <dt>Access token</dt>
              <dd>Guardado en memoria; se pierde al recargar la página.</dd>
            </div>
          </dl>
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
