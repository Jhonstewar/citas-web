import { ArrowRight, CalendarClock, CalendarDays, CalendarOff, MapPin, Stethoscope, TriangleAlert, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { toApiError, type ApiError } from '../../api/ApiError';
import { getSites } from '../../api/catalogApi';
import {
  ERROR_CODES,
  RESCHEDULE_REASON_MAX,
  type AppointmentDetail,
  type IsoDate,
  type Offer,
  type Site,
} from '../../api/contracts';
import { getMyAppointment, requestReschedule } from '../../api/patientApi';
import { Card } from '../../components/Card';
import { TextAreaField } from '../../components/ChoiceControls';
import { DetailItem, DetailList } from '../../components/DetailList';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { FormAlert } from '../../components/FormAlert';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { SubmitButton } from '../../components/SubmitButton';
import { useToast } from '../../components/toastContext';
import { todayIso } from '../../lib/dates';
import { notFound } from '../../lib/notFound';
import { useResource } from '../../lib/useResource';
import { DateTimeStep } from './booking/DateTimeStep';
import { sameOffer } from './booking/offers';
import type { AppointmentDetailLocationState } from './AppointmentDetailPage';
import { slotText } from './slotText';

/** Errores que significan que la cita dejó de admitir la solicitud: se recarga su detalle. */
const NOT_ELIGIBLE_CODES: readonly (string | undefined)[] = [
  ERROR_CODES.invalidTransition,
  ERROR_CODES.reschedulePending,
  ERROR_CODES.appointmentExpired,
];

/** Errores de la franja elegida: se recarga la oferta y se deja elegir otra. */
const SLOT_CODES: readonly (string | undefined)[] = [
  ERROR_CODES.slotTaken,
  ERROR_CODES.slotNotAvailable,
  ERROR_CODES.pastTime,
];

interface Loaded {
  appointment: AppointmentDetail;
  sites: Site[];
}

type Outcome =
  | { kind: 'none' }
  | { kind: 'slot'; message: string }
  | { kind: 'same-slot'; message: string }
  | { kind: 'not-eligible'; message: string }
  | { kind: 'error'; error: ApiError };

/**
 * HU-027 · Solicitar reprogramación de una cita `APPROVED` y futura. Profesional y especialidad
 * son fijos (cambiarlos es una cita nueva, RF-15); la franja nueva se busca con la misma
 * disponibilidad del agendamiento filtrada por el `specialtyId` y el `professionalId` de la cita.
 * La cita original sigue vigente hasta que Administración decide (RN-10). Si es elegible o no lo
 * dice `reschedulable` del backend; si la franja sirve, lo dice la respuesta del POST.
 */
export function ReschedulePage() {
  const params = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const id = Number(params.id);

  const loaded = useResource<Loaded>(
    (signal) =>
      Number.isInteger(id) && id > 0
        ? Promise.all([getMyAppointment(id, signal), getSites(signal)]).then(([appointment, sites]) => ({
            appointment,
            sites,
          }))
        : Promise.reject(notFound()),
    [id],
  );

  const [siteId, setSiteId] = useState<number | null>(null);
  const [windowStart, setWindowStart] = useState<IsoDate>(() => todayIso());
  const [date, setDate] = useState<IsoDate | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState<string | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' });

  const detailPath = `/paciente/citas/${params.id ?? ''}`;
  const back = { to: detailPath, label: 'Detalle de la cita' };

  if (loaded.state.status === 'loading') {
    return (
      <div className="page">
        <PageHeader title="Solicitar reprogramación" back={back} />
        <LoadingSection label="Cargando la cita…" count={2} />
      </div>
    );
  }

  if (loaded.state.status === 'error') {
    const missing = loaded.state.error.kind === 'not_found';
    return (
      <div className="page">
        <PageHeader title="Solicitar reprogramación" back={missing ? { to: '/paciente/citas', label: 'Mis citas' } : back} />
        <ErrorState
          error={loaded.state.error}
          title={missing ? 'No encontramos esta cita' : undefined}
          onRetry={() => loaded.reload()}
        />
      </div>
    );
  }

  const { appointment, sites } = loaded.state.data;
  const current = {
    date: appointment.date,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    site: appointment.site,
  };

  if (!appointment.reschedulable) {
    return (
      <div className="page">
        <PageHeader title="Solicitar reprogramación" back={back} />
        {outcome.kind === 'not-eligible' ? <FormAlert tone="error" title={outcome.message} /> : null}
        <Card>
          <EmptyState
            icon={<CalendarOff size={36} />}
            title="Esta cita no se puede reprogramar"
            description={notEligibleReason(appointment)}
            action={
              <Link className="button button--primary button--link" to={detailPath}>
                Volver al detalle
              </Link>
            }
          />
        </Card>
      </div>
    );
  }

  function chooseSite(value: number | null) {
    setSiteId(value);
    setDate(null);
    setOffer(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (offer === null || submitting) return;
    if (reason.trim().length > RESCHEDULE_REASON_MAX) {
      setReasonError(`El motivo no puede superar ${RESCHEDULE_REASON_MAX} caracteres.`);
      return;
    }
    setSubmitting(true);
    setOutcome({ kind: 'none' });
    setReasonError(undefined);
    try {
      await requestReschedule(appointment.id, {
        siteId: offer.site.id,
        date: offer.date,
        startTime: offer.startTime,
        reason,
      });
      toast.show({
        tone: 'success',
        title: 'Solicitud de reprogramación enviada',
        description: 'Tu cita actual sigue vigente hasta que Administración decida.',
      });
      // Aclaración 7 del contrato S4: el detalle se vuelve a pedir para reflejar
      // `pendingReschedule` y `reschedulable`; la pantalla de detalle lo carga al montarse.
      const state: AppointmentDetailLocationState = { rescheduleRequested: true };
      void navigate(detailPath, { state });
    } catch (cause) {
      const error = toApiError(cause);
      if (NOT_ELIGIBLE_CODES.includes(error.code) && error.status === 409) {
        setOutcome({ kind: 'not-eligible', message: error.message });
        loaded.reload();
      } else if (error.code === ERROR_CODES.sameSlot) {
        setOffer(null);
        setOutcome({ kind: 'same-slot', message: error.message });
      } else if (SLOT_CODES.includes(error.code)) {
        // La franja se ocupó o dejó de servir: se recargan los horarios y se elige otra.
        setOffer(null);
        setReloadKey((key) => key + 1);
        setOutcome({ kind: 'slot', message: error.message });
      } else if (typeof error.fieldErrors.reason === 'string') {
        setReasonError(error.fieldErrors.reason);
      } else {
        setOutcome({ kind: 'error', error });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page">
      <PageHeader
        back={back}
        eyebrow="Reprogramar cita"
        title="Solicitar reprogramación"
        description="Elige una nueva franja con el mismo profesional. Tu cita actual se conserva hasta que Administración decida."
      />

      <Card title="Cita actual → nueva franja" icon={<CalendarClock size={20} />}>
        <DetailList columns={2}>
          <DetailItem icon={<CalendarDays size={18} />} label="Cita actual">
            {slotText(current)}
          </DetailItem>
          <DetailItem icon={<ArrowRight size={18} />} label="Nueva franja">
            {offer !== null ? (
              slotText(offer)
            ) : (
              <span className="muted">Elige un día y una hora más abajo.</span>
            )}
          </DetailItem>
          <DetailItem icon={<Stethoscope size={18} />} label="Especialidad (no cambia)">
            {appointment.specialty.name} · {appointment.durationMinutes} minutos
          </DetailItem>
          <DetailItem icon={<UserRound size={18} />} label="Profesional (no cambia)">
            {appointment.professional.fullName}
          </DetailItem>
        </DetailList>
        <p className="field__hint">
          Cambiar de profesional o de especialidad es una cita nueva: agéndala desde “Agendar cita”.
        </p>
      </Card>

      <Card as="section" title="Nueva fecha y hora">
        <div className="stack stack--lg">
          <div className="stack stack--sm">
            <p className="field__label" id="reprogramar-sede">
              Sede
            </p>
            <div className="chips" role="group" aria-labelledby="reprogramar-sede">
              <button type="button" className="chip" aria-pressed={siteId === null} onClick={() => chooseSite(null)}>
                Cualquiera
              </button>
              {sites.map((site) => (
                <button
                  key={site.id}
                  type="button"
                  className="chip"
                  aria-pressed={siteId === site.id}
                  onClick={() => chooseSite(site.id)}
                >
                  <MapPin size={14} aria-hidden="true" />
                  {site.name}
                </button>
              ))}
            </div>
            <p className="field__hint">
              Solo verás horarios en las sedes donde {appointment.professional.fullName} tiene
              agenda. La nueva franja puede estar en otra sede.
            </p>
          </div>

          {outcome.kind === 'slot' ? (
            <p className="note note--warning" role="alert">
              <TriangleAlert size={18} aria-hidden="true" />
              <span>
                <strong>Esa franja ya no está disponible.</strong> Actualizamos los horarios: elige
                otra. <span className="muted">({outcome.message})</span>
              </span>
            </p>
          ) : null}
          {outcome.kind === 'same-slot' ? (
            <p className="note note--warning" role="alert">
              <TriangleAlert size={18} aria-hidden="true" />
              <span>
                <strong>{outcome.message}</strong> Elige una fecha, hora o sede distinta de la de tu
                cita actual.
              </span>
            </p>
          ) : null}

          <DateTimeStep
            specialtyId={appointment.specialty.id}
            siteId={siteId}
            windowStart={windowStart}
            onWindowChange={(start) => {
              setWindowStart(start);
              setDate(null);
              setOffer(null);
            }}
            date={date}
            onDateChange={(value) => {
              setDate(value);
              setOffer(null);
            }}
            professionalId={null}
            onProfessionalChange={() => undefined}
            selected={offer}
            onSelect={(value) => {
              setOffer(sameOffer(offer, value) ? null : value);
              if (outcome.kind === 'same-slot' || outcome.kind === 'slot') setOutcome({ kind: 'none' });
            }}
            reloadKey={reloadKey}
            fixedProfessionalId={appointment.professional.id}
            emptyDescription="Prueba con los 14 días siguientes o con otra sede."
          />
        </div>
      </Card>

      <Card as="section" title="Enviar solicitud">
        <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          <TextAreaField
            label="Motivo (opcional)"
            name="reason"
            rows={3}
            counterMax={RESCHEDULE_REASON_MAX}
            hint="Ayuda a Administración a decidir."
            value={reason}
            error={reasonError}
            disabled={submitting}
            onChange={(event) => {
              setReason(event.target.value);
              setReasonError(undefined);
            }}
          />
          {outcome.kind === 'error' ? <FormAlert tone="error" title={outcome.error.message} /> : null}
          {offer === null ? (
            <p className="field__hint" id="reprogramar-requisito">
              Elige primero la nueva franja.
            </p>
          ) : null}
          <div className="form-actions">
            <Link className="button button--ghost button--link" to={detailPath}>
              Volver sin cambios
            </Link>
            <SubmitButton loading={submitting} disabled={offer === null} keepLabel>
              <CalendarClock size={18} aria-hidden="true" />
              Solicitar reprogramación
            </SubmitButton>
          </div>
        </form>
      </Card>
    </div>
  );
}

/** Explica por qué `reschedulable` es falso. No decide nada: el backend ya lo decidió. */
function notEligibleReason(appointment: AppointmentDetail): string {
  if (appointment.pendingReschedule) {
    return 'Ya tienes una solicitud de reprogramación pendiente para esta cita. Espera la decisión de Administración.';
  }
  if (appointment.status !== 'APPROVED') {
    return `Solo se reprograma una cita aprobada. Esta cita está en estado «${appointment.statusName}».`;
  }
  return 'La hora de esta cita ya llegó o pasó: solo se reprograma una cita futura.';
}
