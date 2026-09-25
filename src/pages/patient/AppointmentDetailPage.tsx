import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CalendarX,
  CircleX,
  Clock,
  History,
  Hourglass,
  Info,
  MapPin,
  Stethoscope,
  Timer,
  UserRound,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type {
  AppointmentDetail,
  AppointmentStatus,
  HistoryEntry,
  HistorySource,
  RescheduleRequest,
} from '../../api/contracts';
import { getMyAppointment } from '../../api/patientApi';
import { notFound } from '../../lib/notFound';
import { Card } from '../../components/Card';
import { DetailItem, DetailList } from '../../components/DetailList';
import { ErrorState } from '../../components/ErrorState';
import { FormAlert } from '../../components/FormAlert';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { Timeline, type TimelineEntry } from '../../components/Timeline';
import { formatDateTime, formatLongDate, parseBogotaDateTime } from '../../lib/dates';
import { statusLabel } from '../../lib/status';
import { useResource } from '../../lib/useResource';
import { CancelAppointmentDialog } from './CancelAppointmentDialog';
import { slotText } from './slotText';

const SOURCE_LABEL: Readonly<Record<HistorySource, string>> = {
  SYSTEM: 'automático del sistema',
  USER: 'por ti',
  ADMIN: 'por Administración',
  PROFESSIONAL: 'por el profesional',
};

/** Estados sin acciones posibles. Solo sirve para EXPLICAR por qué no hay botones. */
const TERMINAL_STATUSES: readonly AppointmentStatus[] = ['REJECTED', 'CANCELLED', 'COMPLETED', 'NO_SHOW'];

/** Estado de navegación con el que vuelve la pantalla de reprogramar tras el 201. */
export interface AppointmentDetailLocationState {
  rescheduleRequested?: boolean;
}

/** Clave de sessionStorage con la que se recuerda "Conservar mi cita" tras un rechazo. */
function keptKey(reschedule: RescheduleRequest): string {
  return `citas.reschedule-rejection-kept.${reschedule.id}`;
}

/** sessionStorage puede no existir o lanzar (modo privado, cuota): nunca rompe la pantalla. */
function readKept(reschedule: RescheduleRequest): boolean {
  try {
    return window.sessionStorage.getItem(keptKey(reschedule)) === '1';
  } catch {
    return false;
  }
}

function writeKept(reschedule: RescheduleRequest) {
  try {
    window.sessionStorage.setItem(keptKey(reschedule), '1');
  } catch {
    // Sin almacenamiento el aviso se cierra igual; solo volverá a mostrarse al recargar.
  }
}

/**
 * Por qué no se ofrece una acción. La decisión la toman `cancellable` y `reschedulable` del
 * backend; esto solo pone en palabras la causa más probable para que el paciente no vea un hueco.
 */
function unavailableReason(appointment: AppointmentDetail): string | null {
  if (TERMINAL_STATUSES.includes(appointment.status)) {
    return `Esta cita está en estado «${statusLabel(appointment.status, appointment.statusName)}»: ya no admite cancelación ni reprogramación.`;
  }
  if (!appointment.cancellable) {
    return 'La hora de esta cita ya llegó o pasó: ya no se puede cancelar ni reprogramar.';
  }
  if (!appointment.reschedulable) {
    if (appointment.pendingReschedule) {
      return 'Ya tienes una solicitud de reprogramación pendiente: espera a que Administración la decida antes de pedir otra.';
    }
    if (appointment.status === 'REQUESTED') {
      return 'Solo una cita aprobada se puede reprogramar. Esta sigue en revisión.';
    }
    return 'Esta cita no se puede reprogramar en este momento.';
  }
  return null;
}

/**
 * Detalle de una cita propia (HU-025): los siete datos de RF-13, el motivo de rechazo solo si
 * existe (CA-05/CA-06, HU-030 CA-06) y la línea de tiempo del historial (HU-032).
 * S4: cancelar (HU-026), solicitar reprogramación (HU-027) y el estado de la última
 * reprogramación con "Conservar" o "Cancelar" tras un rechazo (HU-028).
 * Una cita ajena responde 404: el backend no revela que exista.
 */
export function AppointmentDetailPage() {
  const params = useParams();
  const location = useLocation();
  const id = Number(params.id);
  // Un id no numérico no se pide al backend (evita GET /NaN): se trata como no encontrado.
  const detail = useResource(
    (signal) => (Number.isInteger(id) && id > 0 ? getMyAppointment(id, signal) : Promise.reject(notFound())),
    [id],
  );
  const [cancelOpen, setCancelOpen] = useState(false);
  const [keptIds, setKeptIds] = useState<readonly number[]>([]);

  const back = { to: '/paciente/citas', label: 'Mis citas' };
  const justRescheduled =
    (location.state as AppointmentDetailLocationState | null)?.rescheduleRequested === true;

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
  const lastReschedule = appointment.lastReschedule ?? null;
  const blockedReason = unavailableReason(appointment);
  const kept =
    lastReschedule !== null && (keptIds.includes(lastReschedule.id) || readKept(lastReschedule));
  // Con el aviso de rechazo abierto, "Cancelar cita" vive en el aviso: no se duplica abajo.
  const rejectionDecisionOpen =
    lastReschedule?.status === 'REJECTED' && !kept && appointment.status === 'APPROVED';

  function keepAppointment(reschedule: RescheduleRequest) {
    // HU-028 CA-02 / T-03: conservar la cita NO llama a la API; solo se cierra el aviso.
    writeKept(reschedule);
    setKeptIds((ids) => [...ids, reschedule.id]);
  }

  const cancelButton = appointment.cancellable ? (
    <button type="button" className="button button--danger-outline" onClick={() => setCancelOpen(true)}>
      <CalendarX size={18} aria-hidden="true" />
      Cancelar cita
    </button>
  ) : null;

  return (
    <div className="page">
      <PageHeader
        back={back}
        eyebrow="Detalle de la cita"
        title={appointment.specialty.name}
        description={formatLongDate(appointment.date)}
        actions={<StatusBadge status={appointment.status} statusName={appointment.statusName} />}
      />

      {justRescheduled && appointment.pendingReschedule ? (
        <FormAlert tone="success" title="Reprogramación pendiente; tu cita actual sigue vigente.">
          <p>Administración revisará la nueva franja. Verás aquí su decisión.</p>
        </FormAlert>
      ) : null}

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

      {lastReschedule !== null ? (
        <RescheduleNotice
          appointment={appointment}
          reschedule={lastReschedule}
          kept={kept}
          onKeep={() => keepAppointment(lastReschedule)}
          cancelButton={cancelButton}
        />
      ) : null}

      <div className="grid grid--sidebar">
        <div className="stack stack--lg">
          <Card title="Datos de la cita">
            <DetailList columns={2}>
              <DetailItem icon={<CalendarDays size={18} />} label="Fecha">
                {formatLongDate(appointment.date)}
              </DetailItem>
              <DetailItem icon={<Clock size={18} />} label="Hora">
                {appointment.startTime} – {appointment.endTime}
              </DetailItem>
              <DetailItem icon={<Timer size={18} />} label="Duración">
                {appointment.durationMinutes} minutos
              </DetailItem>
              <DetailItem icon={<Stethoscope size={18} />} label="Especialidad">
                {appointment.specialty.name}
              </DetailItem>
              <DetailItem icon={<UserRound size={18} />} label="Profesional">
                {appointment.professional.fullName}
              </DetailItem>
              <DetailItem icon={<MapPin size={18} />} label="Sede">
                {appointment.site.name}
              </DetailItem>
            </DetailList>
          </Card>

          <Card title="Acciones" icon={<CalendarClock size={20} />}>
            <div className="stack">
              {(appointment.cancellable && !rejectionDecisionOpen) || appointment.reschedulable ? (
                <div className="cluster">
                  {appointment.reschedulable ? (
                    <Link
                      className="button button--primary button--link"
                      to={`/paciente/citas/${appointment.id}/reprogramar`}
                    >
                      <CalendarClock size={18} aria-hidden="true" />
                      Solicitar reprogramación
                    </Link>
                  ) : null}
                  {rejectionDecisionOpen ? null : cancelButton}
                </div>
              ) : null}
              {blockedReason !== null ? (
                <p className="note">
                  <Info size={18} aria-hidden="true" />
                  <span>{blockedReason}</span>
                </p>
              ) : null}
            </div>
          </Card>
        </div>

        <Card title="Historial" icon={<History size={20} />}>
          <Timeline entries={history.map(toTimelineEntry)} />
        </Card>
      </div>

      <CancelAppointmentDialog
        appointment={cancelOpen ? appointment : null}
        onClose={() => setCancelOpen(false)}
        onCancelled={(updated) => {
          setCancelOpen(false);
          detail.update(() => updated);
        }}
        onStale={() => {
          setCancelOpen(false);
          detail.reload();
        }}
      />
    </div>
  );
}

/**
 * HU-028 · Estado de la última solicitud de reprogramación. Tras un rechazo el paciente decide:
 * conservar (sin escritura) o cancelar (reutiliza el diálogo de HU-026).
 */
function RescheduleNotice({
  appointment,
  reschedule,
  kept,
  onKeep,
  cancelButton,
}: {
  appointment: AppointmentDetail;
  reschedule: RescheduleRequest;
  kept: boolean;
  onKeep: () => void;
  cancelButton: ReactNode;
}) {
  const current = slotText({
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    site: appointment.site,
  });
  const decisionReason = reschedule.decisionReason?.trim() ?? '';

  if (reschedule.status === 'PENDING') {
    return (
      <section className="note note--warning" aria-label="Reprogramación pendiente">
        <Hourglass size={18} aria-hidden="true" />
        <div className="stack stack--sm">
          <p>
            <strong>Reprogramación pendiente; tu cita actual sigue vigente.</strong> Administración
            decidirá si la cambia a la franja propuesta.
          </p>
          <DetailList columns={2}>
            <DetailItem icon={<CalendarDays size={18} />} label="Cita actual">
              {slotText(reschedule.previous)}
            </DetailItem>
            <DetailItem icon={<ArrowRight size={18} />} label="Franja propuesta">
              {slotText(reschedule.proposed)}
            </DetailItem>
          </DetailList>
        </div>
      </section>
    );
  }

  if (reschedule.status === 'REJECTED') {
    // Sin decisión pendiente (conservada o cita ya no activa): el rechazo queda como información.
    const decisionOpen = !kept && appointment.status === 'APPROVED';
    if (!decisionOpen) {
      return (
        <p className="note" role="note">
          <Info size={18} aria-hidden="true" />
          <span>
            Tu última solicitud de reprogramación (a {slotText(reschedule.proposed)}) fue rechazada
            {decisionReason !== '' ? `: ${decisionReason}` : '.'}
          </span>
        </p>
      );
    }
    return (
      <section className="note note--danger" aria-labelledby="reprogramacion-rechazada">
        <CircleX size={18} aria-hidden="true" />
        <div className="stack stack--sm">
          <p id="reprogramacion-rechazada">
            <strong>Tu solicitud de reprogramación fue rechazada.</strong>
          </p>
          <DetailList>
            <DetailItem label="Franja propuesta (rechazada)">{slotText(reschedule.proposed)}</DetailItem>
            {decisionReason !== '' ? <DetailItem label="Motivo">{decisionReason}</DetailItem> : null}
            <DetailItem label="Tu cita vigente">{current}</DetailItem>
          </DetailList>
          <p>¿Qué quieres hacer? Puedes conservar tu cita tal como está o cancelarla.</p>
          <div className="cluster">
            <button type="button" className="button button--primary" onClick={onKeep}>
              Conservar mi cita
            </button>
            {cancelButton}
          </div>
        </div>
      </section>
    );
  }

  if (reschedule.status === 'APPROVED') {
    return (
      <p className="note" role="note">
        <Info size={18} aria-hidden="true" />
        <span>
          <strong>Reprogramada desde</strong> {slotText(reschedule.previous)}.
        </span>
      </p>
    );
  }

  // CANCELLED: se canceló junto con la cita (D18).
  return (
    <p className="note" role="note">
      <Info size={18} aria-hidden="true" />
      <span>
        La solicitud de reprogramación a {slotText(reschedule.proposed)} quedó cancelada.
      </span>
    </p>
  );
}

/** Traduce una entrada del historial de la API a los textos de la línea de tiempo. */
function toTimelineEntry(entry: HistoryEntry, index: number): TimelineEntry {
  const actor =
    entry.source === 'USER'
      ? SOURCE_LABEL.USER
      : entry.actorName !== undefined && entry.actorName !== null && entry.actorName !== ''
        ? `por ${entry.actorName}`
        : SOURCE_LABEL[entry.source];
  return {
    id: `${entry.changedAt}-${index}`,
    status: entry.status,
    label: statusLabel(entry.status, entry.statusName),
    actor,
    reason: entry.reason,
    date: formatDateTime(entry.changedAt),
  };
}
