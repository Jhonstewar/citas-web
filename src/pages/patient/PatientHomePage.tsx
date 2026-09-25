import { CalendarDays, CalendarPlus, CalendarX, IdCard, Info, Mail, Phone, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { DOCUMENT_TYPES, type Appointment } from '../../api/contracts';
import { listMyAppointments } from '../../api/patientApi';
import { useCurrentUser } from '../../auth/CurrentUserContext';
import { AppointmentCard } from '../../components/AppointmentCard';
import { Card } from '../../components/Card';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { LoadingSection } from '../../components/Skeleton';
import { formatLongDate, isUpcoming } from '../../lib/dates';
import { useResource } from '../../lib/useResource';
import { CancelAppointmentDialog } from './CancelAppointmentDialog';
import { PendingRescheduleMark } from './PendingRescheduleMark';

const ACTIVE_STATUSES = new Set(['APPROVED', 'REQUESTED']);

/** Inicio del paciente (PRD §6): saludo, próximas citas y acceso directo a agendar. */
export function PatientHomePage() {
  const { user } = useCurrentUser();
  const appointments = useResource((signal) => listMyAppointments({}, signal), []);
  const [toCancel, setToCancel] = useState<Appointment | null>(null);

  const documentType = DOCUMENT_TYPES.find((type) => type.code === user.documentType);

  const upcoming =
    appointments.state.status === 'ready'
      ? appointments.state.data.filter(
          (item) => ACTIVE_STATUSES.has(item.status) && isUpcoming(item.date, item.startTime),
        )
      : [];

  return (
    <div className="page">
      <section className="hero" aria-labelledby="saludo">
        <div className="hero__intro">
          <div className="stack stack--sm">
            {upcoming.length > 0 ? (
              <p className="hero__pill">
                <CalendarDays size={14} aria-hidden="true" />
                {upcoming.length === 1
                  ? 'Tienes 1 cita programada'
                  : `Tienes ${upcoming.length} citas programadas`}
              </p>
            ) : null}
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
            <Link className="button button--ghost button--link" to="/paciente/perfil">
              <UserRound size={18} aria-hidden="true" />
              Mi perfil y afiliación
            </Link>
          </div>
        </div>

        {/* Tira de datos de la cuenta: lo que el paciente necesita confirmar antes de reservar. */}
        <dl className="hero__meta">
          <div className="hero__meta-item">
            <IdCard size={18} aria-hidden="true" />
            <div>
              <dt>Documento</dt>
              <dd>
                {documentType?.label ?? user.documentType} {user.documentNumber}
              </dd>
            </div>
          </div>
          <div className="hero__meta-item">
            <Mail size={18} aria-hidden="true" />
            <div>
              <dt>Correo</dt>
              <dd>{user.email}</dd>
            </div>
          </div>
          {user.phone !== undefined ? (
            <div className="hero__meta-item">
              <Phone size={18} aria-hidden="true" />
              <div>
                <dt>Teléfono</dt>
                <dd>{user.phone}</dd>
              </div>
            </div>
          ) : null}
        </dl>
      </section>

      <CancelAppointmentDialog
        appointment={toCancel}
        onClose={() => setToCancel(null)}
        onCancelled={() => {
          setToCancel(null);
          appointments.reload({ silent: true });
        }}
        onStale={() => {
          setToCancel(null);
          appointments.reload();
        }}
      />

      <p className="note">
        <Info size={18} aria-hidden="true" />
        <span>
          Las citas <strong>generales</strong> se confirman al instante; las{' '}
          <strong>especializadas</strong> quedan en revisión hasta que un administrador las
          aprueba.
        </span>
      </p>

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
          <ErrorState
            compact
            error={appointments.state.error}
            onRetry={() => appointments.reload()}
          />
        ) : null}
        {appointments.state.status === 'ready' ? (
          upcoming.length === 0 ? (
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
          ) : (
            <ul className="appointment-list">
              {upcoming.slice(0, 3).map((item, index) => (
                <li key={item.id} className="stack stack--sm">
                  <AppointmentCard
                    appointment={item}
                    to={`/paciente/citas/${item.id}`}
                    footer={<PendingRescheduleMark appointment={item} />}
                  />
                  {/* HU-026: la próxima cita se puede cancelar desde aquí, solo si el servidor
                      la declara `cancellable` (aclaración 8 del contrato S4). Si deja de serlo
                      entre tanto, el backend responde 409 y la lista se recarga. */}
                  {index === 0 && item.cancellable ? (
                    <div className="cluster">
                      <button
                        type="button"
                        className="button button--danger-outline button--sm"
                        onClick={() => setToCancel(item)}
                      >
                        <CalendarX size={16} aria-hidden="true" />
                        Cancelar cita
                        <span className="visually-hidden">
                          {' '}
                          de {item.specialty.name}, {formatLongDate(item.date)}
                        </span>
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )
        ) : null}
      </Card>
    </div>
  );
}
