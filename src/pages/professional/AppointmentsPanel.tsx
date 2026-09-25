import {
  CalendarCheck,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Clock,
  Hourglass,
  IdCard,
  MapPin,
  Timer,
  UserRound,
} from 'lucide-react';
import { useState } from 'react';
import { toApiError } from '../../api/ApiError';
import type { IsoDate, ProfessionalAppointment, SiteRef } from '../../api/contracts';
import { completeAppointment, listAppointments, markNoShow } from '../../api/professionalApi';
import { DateBlock } from '../../components/AppointmentCard';
import { SegmentedControl } from '../../components/ChoiceControls';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { SelectField } from '../../components/SelectField';
import { LoadingSection } from '../../components/Skeleton';
import { StatusBadge } from '../../components/StatusBadge';
import { useToast } from '../../components/toastContext';
import {
  addDays,
  formatLongDate,
  formatRange,
  formatShortDate,
  startOfWeek,
  todayIso,
} from '../../lib/dates';
import { useResource } from '../../lib/useResource';

type View = 'day' | 'week';
type Outcome = 'COMPLETED' | 'NO_SHOW';

const VIEW_OPTIONS = [
  { value: 'day', label: 'Día' },
  { value: 'week', label: 'Semana' },
] as const;

interface Closing {
  appointment: ProfessionalAppointment;
  outcome: Outcome;
}

/** Rango consultado: un día (`from` = `to`) o la semana de lunes a domingo (D35). */
function rangeOf(view: View, anchor: IsoDate): { from: IsoDate; to: IsoDate } {
  if (view === 'day') return { from: anchor, to: anchor };
  const monday = startOfWeek(anchor);
  return { from: monday, to: addDays(monday, 6) };
}

function patientLabel(appointment: ProfessionalAppointment): string {
  return appointment.patient.fullName;
}

/**
 * Citas aprobadas del profesional (HU-020) y cierre de la atención (HU-021).
 *
 * El backend decide qué citas se listan (solo `APPROVED` y propias) y si una cita es cerrable
 * (`closable`, D19): la pantalla solo lo refleja. Una cita cerrada sale de la lista porque el
 * listado solo trae `APPROVED` (aclaración 6 del contrato S4).
 */
export function AppointmentsPanel({ sites }: { sites: readonly SiteRef[] }) {
  const toast = useToast();
  const today = todayIso();
  const [view, setView] = useState<View>('day');
  const [anchor, setAnchor] = useState<IsoDate>(today);
  const [siteId, setSiteId] = useState('');
  const { from, to } = rangeOf(view, anchor);

  const appointments = useResource(
    (signal) => listAppointments(from, to, siteId === '' ? undefined : Number(siteId), signal),
    [from, to, siteId],
  );

  const [closing, setClosing] = useState<Closing | null>(null);
  const [busy, setBusy] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  function move(direction: 1 | -1) {
    setAnchor((current) => addDays(current, direction * (view === 'day' ? 1 : 7)));
  }

  async function confirmClose() {
    if (closing === null || busy) return;
    const { appointment, outcome } = closing;
    setBusy(true);
    setCloseError(null);
    try {
      await (outcome === 'COMPLETED' ? completeAppointment(appointment.id) : markNoShow(appointment.id));
      appointments.update((list) => list.filter((item) => item.id !== appointment.id));
      setClosing(null);
      toast.show({
        title: outcome === 'COMPLETED' ? 'Cita marcada como atendida' : 'Inasistencia registrada',
        description: `${patientLabel(appointment)} · ${formatShortDate(appointment.date)} ${appointment.startTime}. La cita sale de la lista de citas aprobadas.`,
      });
    } catch (cause) {
      const error = toApiError(cause);
      if (error.status === 409) {
        // APPOINTMENT_NOT_STARTED o INVALID_TRANSITION: la cita cambió o aún no empezó. Se avisa
        // con el mensaje del servidor y se recarga la lista para mostrar el estado real.
        setClosing(null);
        toast.show({ tone: 'error', title: 'No se pudo cerrar la cita', description: error.message });
        appointments.reload({ silent: true });
      } else {
        setCloseError(error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const siteOptions = sites.map((site) => ({ value: String(site.id), label: site.name }));
  const rangeLabel = view === 'day' ? formatLongDate(from) : formatRange(from, to);
  const isCurrent = view === 'day' ? anchor === today : from === startOfWeek(today);

  return (
    <div className="stack">
      <section className="filters" aria-label="Periodo y sede">
        <SegmentedControl
          legend="Vista"
          name="vista-citas"
          options={VIEW_OPTIONS}
          value={view}
          onChange={setView}
        />
        <SelectField
          label="Sede"
          placeholder="Todas las sedes"
          options={siteOptions}
          value={siteId}
          onChange={(event) => setSiteId(event.target.value)}
        />
      </section>

      <div className="week-nav">
        <div className="cluster">
          <button type="button" className="button button--ghost button--sm" onClick={() => move(-1)}>
            <ChevronLeft size={16} aria-hidden="true" />
            {view === 'day' ? 'Día anterior' : 'Semana anterior'}
          </button>
          <button
            type="button"
            className="button button--ghost button--sm"
            disabled={isCurrent}
            onClick={() => setAnchor(today)}
          >
            Hoy
          </button>
          <button type="button" className="button button--ghost button--sm" onClick={() => move(1)}>
            {view === 'day' ? 'Día siguiente' : 'Semana siguiente'}
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <h2 className="week-nav__range" aria-live="polite" style={{ textTransform: 'capitalize' }}>
          {rangeLabel}
        </h2>
      </div>

      <section aria-label="Citas aprobadas" aria-busy={appointments.state.status === 'loading'}>
        {appointments.state.status === 'loading' ? (
          <LoadingSection label="Cargando tus citas…" variant="row" count={3} />
        ) : null}
        {appointments.state.status === 'error' ? (
          <ErrorState error={appointments.state.error} onRetry={() => appointments.reload()} />
        ) : null}
        {appointments.state.status === 'ready' && appointments.state.data.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck size={36} />}
            title="No tienes citas aprobadas en este periodo"
            description={
              siteId === ''
                ? 'Cambia de día o de semana para ver otras citas.'
                : 'Prueba con otra sede o con todas las sedes.'
            }
          />
        ) : null}
        {appointments.state.status === 'ready' && appointments.state.data.length > 0 ? (
          <ul className="appointment-list">
            {appointments.state.data.map((appointment) => (
              <li key={appointment.id}>
                <ProfessionalAppointmentCard
                  appointment={appointment}
                  today={today}
                  onClose={(outcome) => {
                    setCloseError(null);
                    setClosing({ appointment, outcome });
                  }}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <ConfirmDialog
        open={closing !== null}
        title={closing?.outcome === 'NO_SHOW' ? '¿Registrar inasistencia?' : '¿Marcar la cita como atendida?'}
        confirmLabel={closing?.outcome === 'NO_SHOW' ? 'Registrar inasistencia' : 'Marcar como atendida'}
        tone={closing?.outcome === 'NO_SHOW' ? 'danger' : 'primary'}
        busy={busy}
        error={closeError}
        onCancel={() => setClosing(null)}
        onConfirm={() => void confirmClose()}
      >
        {closing !== null ? (
          <p>
            La cita de <strong>{closing.appointment.specialty.name}</strong> de{' '}
            {closing.appointment.patient.fullName} del {formatLongDate(closing.appointment.date)} a las{' '}
            {closing.appointment.startTime} quedará registrada como{' '}
            <strong>{closing.outcome === 'NO_SHOW' ? 'no asistió' : 'atendida'}</strong>. Este cierre no se
            puede deshacer.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

/**
 * Tarjeta de cita del profesional: hora, duración, especialidad, sede y el paciente (nombre y
 * documento, el mínimo de RF-16). Si la cita aún no es cerrable, los botones se deshabilitan y
 * el motivo queda visible y asociado a ellos.
 */
function ProfessionalAppointmentCard({
  appointment,
  today,
  onClose,
}: {
  appointment: ProfessionalAppointment;
  today: IsoDate;
  onClose: (outcome: Outcome) => void;
}) {
  const reasonId = `cita-${appointment.id}-motivo`;
  const who = `${appointment.patient.fullName} de las ${appointment.startTime} del ${formatLongDate(appointment.date)}`;
  const availableFrom =
    appointment.date === today
      ? `Disponible desde las ${appointment.startTime}`
      : `Disponible desde las ${appointment.startTime} del ${formatShortDate(appointment.date)}`;
  const describedBy = appointment.closable ? {} : { 'aria-describedby': reasonId };

  return (
    <article className="appointment" aria-label={`Cita de ${who}`}>
      <DateBlock date={appointment.date} />
      <div className="appointment__body">
        <div className="appointment__top">
          <span className="appointment__title">{appointment.specialty.name}</span>
          <StatusBadge status={appointment.status} statusName={appointment.statusName} />
        </div>
        <span className="visually-hidden">{formatLongDate(appointment.date)}</span>
        <div className="appointment__meta">
          <span>
            <Clock size={14} aria-hidden="true" />
            {appointment.startTime} – {appointment.endTime}
          </span>
          <span>
            <Timer size={14} aria-hidden="true" />
            {appointment.durationMinutes} min
          </span>
          <span>
            <MapPin size={14} aria-hidden="true" />
            {appointment.site.name}
          </span>
        </div>
        <div className="appointment__meta">
          <span>
            <UserRound size={14} aria-hidden="true" />
            <strong>{appointment.patient.fullName}</strong>
          </span>
          <span>
            <IdCard size={14} aria-hidden="true" />
            {appointment.patient.documentType} {appointment.patient.documentNumber}
          </span>
        </div>
        <div className="pro-appointment__actions">
          <div className="cluster">
            <button
              type="button"
              className="button button--success button--sm"
              disabled={!appointment.closable}
              aria-label={`Marcar como atendida la cita de ${who}`}
              {...describedBy}
              onClick={() => onClose('COMPLETED')}
            >
              <CalendarCheck size={16} aria-hidden="true" />
              Atendida
            </button>
            <button
              type="button"
              className="button button--danger-outline button--sm"
              disabled={!appointment.closable}
              aria-label={`Registrar inasistencia a la cita de ${who}`}
              {...describedBy}
              onClick={() => onClose('NO_SHOW')}
            >
              <CalendarX size={16} aria-hidden="true" />
              No asistió
            </button>
          </div>
          {appointment.closable ? null : (
            <p className="pro-appointment__reason" id={reasonId}>
              <Hourglass size={14} aria-hidden="true" />
              {availableFrom}
            </p>
          )}
        </div>
      </div>
    </article>
  );
}
