import { CalendarDays, CalendarPlus, IdCard, Info, Mail, Phone } from 'lucide-react';
import { Link } from 'react-router';
import { DOCUMENT_TYPES } from '../../api/contracts';
import { listMyAppointments } from '../../api/patientApi';
import { useCurrentUser } from '../../auth/CurrentUserContext';
import { AppointmentCard } from '../../components/AppointmentCard';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingSection } from '../../components/Skeleton';
import { isUpcoming } from '../../lib/dates';
import { useResource } from '../../lib/useResource';

const ACTIVE_STATUSES = new Set(['APPROVED', 'REQUESTED']);

/** Inicio del paciente (PRD §6): saludo, próximas citas y acceso directo a agendar. */
export function PatientHomePage() {
  const { user } = useCurrentUser();
  const appointments = useResource((signal) => listMyAppointments({}, signal), []);

  const documentType = DOCUMENT_TYPES.find((type) => type.code === user.documentType);

  return (
    <div className="page">
      <section className="hero" aria-labelledby="saludo">
        <div className="stack stack--sm">
          <h1 className="hero__title" id="saludo">
            Hola, {user.firstNames}
          </h1>
          <p className="hero__lead">¿Qué necesitas hoy? Agenda tu cita en pocos pasos.</p>
        </div>
        <div className="cluster">
          <Link className="button button--primary button--lg button--link" to="/paciente/agendar">
            <CalendarPlus size={20} aria-hidden="true" />
            Agendar cita
          </Link>
          <Link className="button button--ghost button--link" to="/paciente/citas">
            Ver mis citas
          </Link>
        </div>
      </section>

      <div className="grid grid--sidebar">
        <Card
          title="Próximas citas"
          icon={<CalendarDays size={20} />}
          busy={appointments.state.status === 'loading'}
          actions={
            <Link className="link text-sm" to="/paciente/citas">
              Ver todas
            </Link>
          }
        >
          {appointments.state.status === 'loading' ? (
            <LoadingSection label="Cargando tus próximas citas…" count={2} />
          ) : null}
          {appointments.state.status === 'error' ? (
            <ErrorState compact error={appointments.state.error} onRetry={() => appointments.reload()} />
          ) : null}
          {appointments.state.status === 'ready'
            ? (() => {
                const upcoming = appointments.state.data
                  .filter(
                    (item) =>
                      ACTIVE_STATUSES.has(item.status) && isUpcoming(item.date, item.startTime),
                  )
                  .slice(0, 3);
                if (upcoming.length === 0) {
                  return (
                    <EmptyState
                      compact
                      icon={<CalendarDays size={32} />}
                      title="No tienes citas próximas"
                      description="Cuando agendes una cita aparecerá aquí."
                      action={
                        <Link className="button button--primary button--link" to="/paciente/agendar">
                          Agendar cita
                        </Link>
                      }
                    />
                  );
                }
                return (
                  <ul className="appointment-list">
                    {upcoming.map((item) => (
                      <li key={item.id}>
                        <AppointmentCard appointment={item} to={`/paciente/citas/${item.id}`} />
                      </li>
                    ))}
                  </ul>
                );
              })()
            : null}
        </Card>

        <div className="stack">
          <Card title="Tus datos" icon={<IdCard size={20} />}>
            <dl className="details">
              <div className="details__item">
                <Mail size={18} className="details__icon" aria-hidden="true" />
                <div>
                  <dt>Correo</dt>
                  <dd>{user.email}</dd>
                </div>
              </div>
              <div className="details__item">
                <IdCard size={18} className="details__icon" aria-hidden="true" />
                <div>
                  <dt>Documento</dt>
                  <dd>
                    {documentType?.label ?? user.documentType} {user.documentNumber}
                  </dd>
                </div>
              </div>
              {user.phone !== undefined ? (
                <div className="details__item">
                  <Phone size={18} className="details__icon" aria-hidden="true" />
                  <div>
                    <dt>Teléfono</dt>
                    <dd>{user.phone}</dd>
                  </div>
                </div>
              ) : null}
            </dl>
          </Card>
          <p className="note">
            <Info size={18} aria-hidden="true" />
            <span>
              Las citas <strong>generales</strong> se confirman al instante; las{' '}
              <strong>especializadas</strong> las aprueba un administrador.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
