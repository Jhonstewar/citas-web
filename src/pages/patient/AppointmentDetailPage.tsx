import {
  CalendarDays,
  CircleX,
  Clock,
  History,
  Hourglass,
  MapPin,
  Stethoscope,
  Timer,
  UserRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useParams } from 'react-router';
import type { HistoryEntry, HistorySource } from '../../api/contracts';
import { getMyAppointment } from '../../api/patientApi';
import { notFound } from '../../lib/notFound';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime, formatLongDate, parseBogotaDateTime } from '../../lib/dates';
import { statusLabel } from '../../lib/status';
import { useResource } from '../../lib/useResource';

const SOURCE_LABEL: Readonly<Record<HistorySource, string>> = {
  SYSTEM: 'automático del sistema',
  USER: 'por ti',
  ADMIN: 'por Administración',
  PROFESSIONAL: 'por el profesional',
};

/**
 * Detalle de una cita propia (HU-025): los siete datos de RF-13, el motivo de rechazo solo si
 * existe (CA-05/CA-06, HU-030 CA-06) y la línea de tiempo del historial (HU-032).
 * Una cita ajena responde 404: el backend no revela que exista.
 */
export function AppointmentDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  // Un id no numérico no se pide al backend (evita GET /NaN): se trata como no encontrado.
  const detail = useResource(
    (signal) => (Number.isInteger(id) && id > 0 ? getMyAppointment(id, signal) : Promise.reject(notFound())),
    [id],
  );

  const back = { to: '/paciente/citas', label: 'Mis citas' };

  if (detail.state.status === 'loading') {
    return (
      <div className="page">
        <PageHeader title="Detalle de la cita" back={back} />
        <LoadingSection label="Cargando la cita…" count={2} />
      </div>
    );
  }

  if (detail.state.status === 'error') {
    const notFound = detail.state.error.kind === 'not_found';
    return (
      <div className="page">
        <PageHeader title="Detalle de la cita" back={back} />
        <ErrorState
          error={detail.state.error}
          title={notFound ? 'No encontramos esta cita' : undefined}
          onRetry={() => detail.reload()}
        />
      </div>
    );
  }

  const appointment = detail.state.data;
  const reason = appointment.rejectionReason?.trim() ?? '';
  const history = [...(appointment.history ?? [])].sort(
    (a, b) =>
      (parseBogotaDateTime(a.changedAt)?.getTime() ?? 0) - (parseBogotaDateTime(b.changedAt)?.getTime() ?? 0),
  );

  return (
    <div className="page">
      <PageHeader
        back={back}
        eyebrow="Detalle de la cita"
        title={appointment.specialty.name}
        description={formatLongDate(appointment.date)}
        actions={<StatusBadge status={appointment.status} statusName={appointment.statusName} />}
      />

      {reason !== '' ? (
        <p className="note note--danger" role="note">
          <CircleX size={18} aria-hidden="true" />
          <span>
            <strong>Motivo del rechazo:</strong> {reason}
          </span>
        </p>
      ) : null}
      {appointment.status === 'REQUESTED' ? (
        <p className="note note--warning">
          <Hourglass size={18} aria-hidden="true" />
          <span>Tu solicitud está en revisión. Un administrador la aprobará o rechazará.</span>
        </p>
      ) : null}

      <div className="grid grid--sidebar">
        <Card title="Datos de la cita">
          <dl className="details details--2">
            <Item icon={<CalendarDays size={18} />} label="Fecha">
              {formatLongDate(appointment.date)}
            </Item>
            <Item icon={<Clock size={18} />} label="Hora">
              {appointment.startTime} – {appointment.endTime}
            </Item>
            <Item icon={<Timer size={18} />} label="Duración">
              {appointment.durationMinutes} minutos
            </Item>
            <Item icon={<Stethoscope size={18} />} label="Especialidad">
              {appointment.specialty.name}
            </Item>
            <Item icon={<UserRound size={18} />} label="Profesional">
              {appointment.professional.fullName}
            </Item>
            <Item icon={<MapPin size={18} />} label="Sede">
              {appointment.site.name}
            </Item>
          </dl>
        </Card>

        <Card title="Historial" icon={<History size={20} />}>
          {history.length === 0 ? (
            <p className="muted text-sm">Sin cambios registrados.</p>
          ) : (
            <ol className="timeline">
              {history.map((entry, index) => (
                <TimelineItem key={`${entry.changedAt}-${index}`} entry={entry} />
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}

function Item({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="details__item">
      <span className="details__icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <dt>{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}

function TimelineItem({ entry }: { entry: HistoryEntry }) {
  const actor =
    entry.source === 'USER'
      ? SOURCE_LABEL.USER
      : entry.actorName !== undefined && entry.actorName !== null && entry.actorName !== ''
        ? `por ${entry.actorName}`
        : SOURCE_LABEL[entry.source];
  return (
    <li className="timeline__item">
      <span className="timeline__dot" aria-hidden="true" />
      <div className="timeline__body">
        <span className="strong">{statusLabel(entry.status, entry.statusName)}</span>
        <span className="timeline__meta">
          {actor} · {formatDateTime(entry.changedAt)}
        </span>
        {entry.reason !== undefined && entry.reason !== null && entry.reason !== '' ? (
          <span className="timeline__meta">Motivo: {entry.reason}</span>
        ) : null}
      </div>
    </li>
  );
}
