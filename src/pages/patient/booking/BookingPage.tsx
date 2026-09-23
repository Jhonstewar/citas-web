import {
  ArrowLeft,
  ArrowRight,
  CalendarCheck,
  CalendarDays,
  Check,
  Clock,
  HeartPulse,
  Hourglass,
  MapPin,
  Search,
  Stethoscope,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link } from 'react-router';
import { toApiError, type ApiError } from '../../../api/ApiError';
import {
  getActiveSpecialties,
  getAppointmentTypes,
  getSites,
} from '../../../api/catalogApi';
import {
  ERROR_CODES,
  type Appointment,
  type AppointmentType,
  type IsoDate,
  type Offer,
  type Site,
  type Specialty,
} from '../../../api/contracts';
import { bookAppointment } from '../../../api/patientApi';
import { Card } from '../../../components/Card';
import { ChoiceCards } from '../../../components/ChoiceControls';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { FormAlert } from '../../../components/FormAlert';
import { PageHeader } from '../../../components/PageHeader';
import { LoadingSection } from '../../../components/Skeleton';
import { StatusBadge } from '../../../components/StatusBadge';
import { formatLongDate, todayIso } from '../../../lib/dates';
import { useResource } from '../../../lib/useResource';
import { DateTimeStep } from './DateTimeStep';
import { sameOffer } from './offers';

const STEPS = ['Tipo de cita', 'Especialidad y sede', 'Fecha y hora', 'Confirmar'] as const;
type Step = 1 | 2 | 3 | 4;

/** Código de la especialidad precargada por migración (D7). */
const GENERAL_MEDICINE_CODE = 'MEDICINA_GENERAL';

interface Catalogs {
  types: Awaited<ReturnType<typeof getAppointmentTypes>>;
  specialties: Specialty[];
  sites: Site[];
}

function loadCatalogs(signal: AbortSignal): Promise<Catalogs> {
  return Promise.all([
    getAppointmentTypes(signal),
    getActiveSpecialties(signal),
    getSites(signal),
  ]).then(([types, specialties, sites]) => ({ types, specialties, sites }));
}

type Outcome =
  | { kind: 'none' }
  | { kind: 'slot-taken'; message: string }
  | { kind: 'error'; error: ApiError };

/**
 * Agendar cita (HU-022..024) en 4 pasos. La ruta de reserva la decide el `appointmentType` de
 * la especialidad: general → `/general` (nace APPROVED), especializada → `/specialized` (nace
 * REQUESTED). La disponibilidad, la doble reserva y el pasado los decide el backend.
 */
export function BookingPage() {
  const catalogs = useResource(loadCatalogs, []);

  const [step, setStep] = useState<Step>(1);
  const [type, setType] = useState<AppointmentType | ''>('');
  const [specialtyId, setSpecialtyId] = useState<number | null>(null);
  const [siteId, setSiteId] = useState<number | null>(null);
  const [specialtyQuery, setSpecialtyQuery] = useState('');
  const [windowStart, setWindowStart] = useState<IsoDate>(() => todayIso());
  const [date, setDate] = useState<IsoDate | null>(null);
  const [professionalId, setProfessionalId] = useState<number | null>(null);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' });
  const [booked, setBooked] = useState<Appointment | null>(null);

  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  // Al cambiar de paso, el foco va al título del paso (lectores de pantalla y teclado).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step, booked]);

  if (catalogs.state.status === 'loading') {
    return (
      <div className="page">
        <PageHeader title="Agendar cita" />
        <LoadingSection label="Preparando el asistente…" count={2} />
      </div>
    );
  }
  if (catalogs.state.status === 'error') {
    return (
      <div className="page">
        <PageHeader title="Agendar cita" />
        <ErrorState error={catalogs.state.error} onRetry={() => catalogs.reload()} />
      </div>
    );
  }

  const { types, specialties, sites } = catalogs.state.data;
  const specialty = specialties.find((item) => item.id === specialtyId) ?? null;
  const specialtiesOfType = specialties.filter((item) => item.appointmentType === type);
  const siteDetail = offer !== null ? sites.find((site) => site.id === offer.site.id) : undefined;

  function chooseType(value: AppointmentType) {
    setType(value);
    setOffer(null);
    setDate(null);
    setProfessionalId(null);
    setSpecialtyQuery('');
    const ofType = specialties.filter((item) => item.appointmentType === value);
    // Cita general: se preselecciona Medicina General (o la única general disponible).
    const preselect =
      value === 'GENERAL'
        ? (ofType.find((item) => item.code === GENERAL_MEDICINE_CODE) ?? (ofType.length === 1 ? ofType[0] : undefined))
        : undefined;
    setSpecialtyId(preselect?.id ?? null);
  }

  function chooseSpecialty(id: number) {
    setSpecialtyId(id);
    setOffer(null);
    setDate(null);
    setProfessionalId(null);
  }

  function chooseSite(id: number | null) {
    setSiteId(id);
    setOffer(null);
    setDate(null);
    setProfessionalId(null);
  }

  function goTo(next: Step) {
    setOutcome({ kind: 'none' });
    setStep(next);
  }

  async function confirm() {
    if (offer === null || specialty === null || submitting) return;
    setSubmitting(true);
    setOutcome({ kind: 'none' });
    try {
      const appointment = await bookAppointment(specialty.appointmentType, {
        professionalId: offer.professional.id,
        siteId: offer.site.id,
        specialtyId: specialty.id,
        date: offer.date,
        startTime: offer.startTime,
      });
      setBooked(appointment);
    } catch (cause) {
      const error = toApiError(cause);
      if (error.status === 409 && (error.code === undefined || error.code === ERROR_CODES.slotTaken)) {
        // Otra reserva ganó la franja: se recargan los horarios y se deja elegir otra.
        setOffer(null);
        // El profesional filtrado puede haberse quedado sin franjas: se vuelve a "Cualquiera".
        setProfessionalId(null);
        setReloadKey((key) => key + 1);
        setStep(3);
        setOutcome({ kind: 'slot-taken', message: error.message });
      } else {
        setOutcome({ kind: 'error', error });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function restart() {
    setBooked(null);
    setStep(1);
    setType('');
    setSpecialtyId(null);
    setSiteId(null);
    setOffer(null);
    setDate(null);
    setProfessionalId(null);
    setWindowStart(todayIso());
    setOutcome({ kind: 'none' });
  }

  if (booked !== null) {
    return <BookingResult appointment={booked} headingRef={headingRef} onRestart={restart} />;
  }

  const canContinue =
    (step === 1 && type !== '') ||
    (step === 2 && specialty !== null) ||
    (step === 3 && offer !== null);

  const filteredSpecialties = specialtiesOfType.filter((item) =>
    item.name.toLocaleLowerCase('es').includes(specialtyQuery.trim().toLocaleLowerCase('es')),
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Paciente"
        title="Agendar cita"
        description="Agenda tu cita en pocos pasos. Nada queda reservado hasta que confirmes."
      />

      <nav className="stepper" aria-label="Progreso de la reserva">
        <div
          className="stepper__progress"
          role="progressbar"
          aria-label="Progreso"
          aria-valuemin={1}
          aria-valuemax={4}
          aria-valuenow={step}
          aria-valuetext={`Paso ${step} de 4: ${STEPS[step - 1]}`}
        >
          <div className="stepper__bar" style={{ width: `${(step / 4) * 100}%` }} />
        </div>
        <ol className="stepper__list">
          {STEPS.map((label, index) => {
            const number = index + 1;
            const state = number === step ? 'current' : number < step ? 'done' : 'todo';
            return (
              <li
                key={label}
                className={`stepper__step stepper__step--${state}`}
                {...(state === 'current' ? { 'aria-current': 'step' as const } : {})}
              >
                <span className="stepper__num" aria-hidden="true">
                  {/* El paso hecho se marca con un visto; el número ya no aporta nada. */}
                  {state === 'done' ? <Check size={16} /> : number}
                </span>
                <span className="stepper__label">{label}</span>
                <span className="visually-hidden">
                  {state === 'done' ? ' (completado)' : state === 'todo' ? ' (pendiente)' : ''}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <Card as="section">
        <h2 className="card__title" ref={headingRef} tabIndex={-1}>
          Paso {step} de 4 · {STEPS[step - 1]}
        </h2>

        {step === 1 ? (
          <ChoiceCards
            legend="¿Qué tipo de cita necesitas?"
            name="tipo-cita"
            value={type}
            onChange={chooseType}
            options={types.map((item) => ({
              value: item.code,
              // El catálogo ya trae el nombre completo ("Cita general"): se usa tal cual.
              label: item.name,
              icon: item.code === 'GENERAL' ? <Stethoscope size={22} /> : <HeartPulse size={22} />,
              description: item.requiresAdminApproval
                ? 'Requiere aprobación de un administrador. Tu horario queda apartado mientras la revisa.'
                : 'Se confirma al instante si el horario sigue libre.',
            }))}
          />
        ) : null}

        {step === 2 ? (
          <div className="stack stack--lg">
            {specialtiesOfType.length === 0 ? (
              <EmptyState
                compact
                icon={<Stethoscope size={32} />}
                title="No hay especialidades disponibles para este tipo"
                description="Vuelve atrás y elige otro tipo de cita."
              />
            ) : (
              <div className="stack stack--sm">
                {specialtiesOfType.length > 6 ? (
                  <div className="field search">
                    <label className="field__label" htmlFor="buscar-especialidad">
                      Buscar especialidad
                    </label>
                    <Search size={18} className="search__icon" aria-hidden="true" />
                    <input
                      id="buscar-especialidad"
                      className="field__input"
                      type="search"
                      value={specialtyQuery}
                      onChange={(event) => setSpecialtyQuery(event.target.value)}
                    />
                  </div>
                ) : null}
                <ChoiceCards
                  legend="Especialidad"
                  name="especialidad"
                  columns={2}
                  value={specialtyId === null ? '' : String(specialtyId)}
                  onChange={(value) => chooseSpecialty(Number(value))}
                  options={filteredSpecialties.map((item) => ({
                    value: String(item.id),
                    label: item.name,
                    description: `Duración: ${item.durationMinutes} min`,
                  }))}
                />
              </div>
            )}
            <div className="stack stack--sm">
              <p className="field__label" id="filtro-sede">
                Sede <span className="muted">(opcional)</span>
              </p>
              <div className="chips" role="group" aria-labelledby="filtro-sede">
                <button
                  type="button"
                  className="chip"
                  aria-pressed={siteId === null}
                  onClick={() => chooseSite(null)}
                >
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
                Podrás filtrar por profesional al ver los horarios del día.
              </p>
            </div>
          </div>
        ) : null}

        {step === 3 && specialty !== null ? (
          <div className="stack">
            {outcome.kind === 'slot-taken' ? (
              <p className="note note--warning" role="alert">
                <TriangleAlert size={18} aria-hidden="true" />
                <span>
                  <strong>Esa franja acaba de ser tomada por otra persona.</strong> Actualizamos los
                  horarios: elige otro. <span className="muted">({outcome.message})</span>
                </span>
              </p>
            ) : null}
            <DateTimeStep
              specialtyId={specialty.id}
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
                setProfessionalId(null);
              }}
              professionalId={professionalId}
              onProfessionalChange={(id) => {
                setProfessionalId(id);
                if (id !== null && offer !== null && offer.professional.id !== id) setOffer(null);
              }}
              selected={offer}
              onSelect={(value) => setOffer(sameOffer(offer, value) ? null : value)}
              reloadKey={reloadKey}
            />
          </div>
        ) : null}

        {step === 4 && offer !== null && specialty !== null ? (
          <div className="stack">
            <p className="muted">Revisa los datos antes de confirmar.</p>
            <dl className="details details--2">
              <SummaryItem icon={<Stethoscope size={18} />} label="Especialidad">
                {specialty.name} · {specialty.appointmentType === 'GENERAL' ? 'Cita general' : 'Cita especializada'}
              </SummaryItem>
              <SummaryItem icon={<Stethoscope size={18} />} label="Profesional">
                {offer.professional.fullName}
              </SummaryItem>
              <SummaryItem icon={<MapPin size={18} />} label="Sede">
                {offer.site.name}
                {siteDetail !== undefined ? (
                  <span className="muted text-sm" style={{ display: 'block' }}>
                    {siteDetail.address}, {siteDetail.city}
                  </span>
                ) : null}
              </SummaryItem>
              <SummaryItem icon={<CalendarDays size={18} />} label="Fecha">
                {formatLongDate(offer.date)}
              </SummaryItem>
              <SummaryItem icon={<Clock size={18} />} label="Hora">
                {offer.startTime} – {offer.endTime}
              </SummaryItem>
              <SummaryItem icon={<Timer size={18} />} label="Duración">
                {offer.durationMinutes} minutos
              </SummaryItem>
            </dl>
            {specialty.appointmentType === 'SPECIALIZED' ? (
              <p className="note note--warning">
                <Hourglass size={18} aria-hidden="true" />
                <span>
                  Es una cita especializada: se enviará como <strong>solicitud</strong> y un
                  administrador la aprobará o rechazará. El horario queda apartado mientras tanto.
                </span>
              </p>
            ) : null}
            {outcome.kind === 'error' ? <FormAlert tone="error" title={outcome.error.message} /> : null}
          </div>
        ) : null}

        <div className="wizard__footer">
          {step > 1 ? (
            <button
              type="button"
              className="button button--ghost"
              onClick={() => goTo((step - 1) as Step)}
              disabled={submitting}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              Atrás
            </button>
          ) : (
            <span />
          )}
          {step < 4 ? (
            <button
              type="button"
              className="button button--primary"
              disabled={!canContinue}
              onClick={() => goTo((step + 1) as Step)}
            >
              Continuar
              <ArrowRight size={18} aria-hidden="true" />
            </button>
          ) : (
            <button
              type="button"
              className="button button--primary"
              onClick={() => void confirm()}
              disabled={submitting}
              aria-busy={submitting}
            >
              {submitting ? <span className="button__spinner" aria-hidden="true" /> : <CalendarCheck size={18} aria-hidden="true" />}
              {specialty?.appointmentType === 'SPECIALIZED' ? 'Enviar solicitud' : 'Confirmar cita'}
            </button>
          )}
        </div>
      </Card>
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  children,
}: {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}) {
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

/** Resultado distinto para cita confirmada (APPROVED) y solicitud pendiente (REQUESTED). */
function BookingResult({
  appointment,
  headingRef,
  onRestart,
}: {
  appointment: Appointment;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onRestart: () => void;
}) {
  const pending = appointment.status === 'REQUESTED';
  return (
    <div className="page">
      <Card>
        <div className="result" role="status">
          <span className={pending ? 'result__icon result__icon--pending' : 'result__icon'} aria-hidden="true">
            {pending ? <Hourglass size={40} /> : <CalendarCheck size={40} />}
          </span>
          <h1 className="result__title" ref={headingRef} tabIndex={-1}>
            {pending ? 'Solicitud enviada' : '¡Listo! Tu cita quedó confirmada'}
          </h1>
          <p className="result__lead">
            {pending
              ? 'Un administrador la revisará. Tu horario queda apartado mientras tanto; verás el resultado en Mis citas.'
              : 'Te esperamos. Llega unos minutos antes con tu documento de identidad.'}
          </p>
          <StatusBadge status={appointment.status} statusName={appointment.statusName} />
          <p>
            <strong>{appointment.specialty.name}</strong> con {appointment.professional.fullName}
            <br />
            {formatLongDate(appointment.date)}, {appointment.startTime} – {appointment.endTime} ·{' '}
            {appointment.site.name}
          </p>
          <div className="cluster" style={{ justifyContent: 'center' }}>
            <Link className="button button--primary button--link" to={`/paciente/citas/${appointment.id}`}>
              Ver detalle
            </Link>
            <Link className="button button--ghost button--link" to="/paciente/citas">
              Ver mis citas
            </Link>
            <button type="button" className="button button--ghost" onClick={onRestart}>
              Agendar otra
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}
