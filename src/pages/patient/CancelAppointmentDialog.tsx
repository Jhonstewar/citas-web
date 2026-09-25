import { CalendarDays, Clock, MapPin, Stethoscope, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { toApiError, type ApiError } from '../../api/ApiError';
import {
  CANCELLATION_REASON_MAX,
  ERROR_CODES,
  type Appointment,
  type AppointmentDetail,
} from '../../api/contracts';
import { cancelAppointment } from '../../api/patientApi';
import { TextAreaField } from '../../components/ChoiceControls';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DetailItem, DetailList } from '../../components/DetailList';
import { useToast } from '../../components/toastContext';
import { formatLongDate } from '../../lib/dates';

/** 409 que significan "la cita ya cambió en el servidor": se recarga en vez de reintentar. */
const STALE_CODES: readonly (string | undefined)[] = [
  ERROR_CODES.invalidTransition,
  ERROR_CODES.appointmentExpired,
];

export interface CancelAppointmentDialogProps {
  /** Cita a cancelar; `null` cierra el diálogo. */
  appointment: Appointment | null;
  onClose: () => void;
  /** 200: el servidor devolvió la cita ya `CANCELLED`. */
  onCancelled: (detail: AppointmentDetail) => void;
  /** 409 `INVALID_TRANSITION` / `APPOINTMENT_EXPIRED`: quien abre el diálogo recarga la cita. */
  onStale: (error: ApiError) => void;
}

/**
 * HU-026 · Confirmación de cancelación con los datos de la cita, la advertencia de que no se
 * reactiva y el motivo opcional (≤ 500). Si la cita tiene una reprogramación `PENDING`, avisa de
 * que también se cancela (D18). Que la cita sea cancelable lo decide el backend: aquí solo se
 * pide y se muestra su respuesta.
 */
export function CancelAppointmentDialog({
  appointment,
  onClose,
  onCancelled,
  onStale,
}: CancelAppointmentDialogProps) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setReason('');
    setReasonError(undefined);
    setError(null);
  }

  function close() {
    if (busy) return;
    reset();
    onClose();
  }

  async function confirm() {
    if (appointment === null || busy) return;
    if (reason.trim().length > CANCELLATION_REASON_MAX) {
      setReasonError(`El motivo no puede superar ${CANCELLATION_REASON_MAX} caracteres.`);
      return;
    }
    setBusy(true);
    setError(null);
    setReasonError(undefined);
    try {
      const detail = await cancelAppointment(appointment.id, reason);
      reset();
      toast.show({
        tone: 'success',
        title: 'Cita cancelada',
        description: `${appointment.specialty.name}, ${formatLongDate(appointment.date)} a las ${appointment.startTime}.`,
      });
      onCancelled(detail);
    } catch (cause) {
      const apiError = toApiError(cause);
      if (apiError.status === 409 && STALE_CODES.includes(apiError.code)) {
        // La cita cambió en el servidor (terminal o ya empezó): se informa con su `detail` y se
        // recarga para mostrar el estado real.
        reset();
        toast.show({ tone: 'error', title: 'No se pudo cancelar la cita', description: apiError.message });
        onStale(apiError);
      } else if (typeof apiError.fieldErrors.reason === 'string') {
        setReasonError(apiError.fieldErrors.reason);
      } else {
        setError(apiError.message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open={appointment !== null}
      title="¿Cancelar esta cita?"
      confirmLabel="Sí, cancelar cita"
      cancelLabel="No, conservarla"
      tone="danger"
      busy={busy}
      error={error}
      onConfirm={() => void confirm()}
      onCancel={close}
    >
      {appointment !== null ? (
        <>
          <DetailList aria-label="Cita a cancelar">
            <DetailItem icon={<Stethoscope size={18} />} label="Especialidad">
              {appointment.specialty.name} · {appointment.professional.fullName}
            </DetailItem>
            <DetailItem icon={<CalendarDays size={18} />} label="Fecha">
              {formatLongDate(appointment.date)}
            </DetailItem>
            <DetailItem icon={<Clock size={18} />} label="Hora">
              {appointment.startTime} – {appointment.endTime}
            </DetailItem>
            <DetailItem icon={<MapPin size={18} />} label="Sede">
              {appointment.site.name}
            </DetailItem>
          </DetailList>
          <p className="note note--danger">
            <TriangleAlert size={18} aria-hidden="true" />
            <span>
              <strong>Una cita cancelada no se puede reactivar.</strong> Si luego la necesitas,
              tendrás que agendar una nueva.
            </span>
          </p>
          {appointment.pendingReschedule ? (
            <p className="note note--warning">
              <TriangleAlert size={18} aria-hidden="true" />
              <span>
                Tienes una <strong>solicitud de reprogramación pendiente</strong> para esta cita:
                también se cancelará.
              </span>
            </p>
          ) : null}
          <TextAreaField
            label="Motivo (opcional)"
            name="reason"
            rows={3}
            counterMax={CANCELLATION_REASON_MAX}
            value={reason}
            error={reasonError}
            disabled={busy}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(undefined);
            }}
          />
        </>
      ) : null}
    </ConfirmDialog>
  );
}
