import { CircleCheck, CircleX, Inbox, PartyPopper, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { toApiError, type ApiError } from '../../api/ApiError';
import {
  approveAppointment,
  approveReschedule,
  getInbox,
  listProfessionals,
  listSpecialties,
  rejectAppointment,
  rejectReschedule,
} from '../../api/adminApi';
import { getSites } from '../../api/catalogApi';
import {
  REJECTION_REASON_MAX,
  type InboxEntry,
  type InboxEntryType,
  type InboxFilters,
} from '../../api/contracts';
import { TextAreaField } from '../../components/ChoiceControls';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { FormAlert } from '../../components/FormAlert';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { LoadingSection } from '../../components/Skeleton';
import { Badge } from '../../components/StatusBadge';
import { SubmitButton } from '../../components/SubmitButton';
import { useToast } from '../../components/toastContext';
import { formatShortDate } from '../../lib/dates';
import { useResource } from '../../lib/useResource';
import { SlotChange } from './SlotChange';

interface FilterOptions {
  sites: { value: string; label: string }[];
  professionals: { value: string; label: string }[];
  specialties: { value: string; label: string }[];
}

function loadFilterOptions(signal: AbortSignal): Promise<FilterOptions> {
  return Promise.all([getSites(signal), listProfessionals({}, signal), listSpecialties(signal)]).then(
    ([sites, professionals, specialties]) => ({
      sites: sites.map((site) => ({ value: String(site.id), label: site.name })),
      professionals: professionals.map((item) => ({ value: String(item.id), label: item.fullName })),
      specialties: specialties.map((item) => ({ value: String(item.id), label: item.name })),
    }),
  );
}

/** Clases de entrada de la bandeja (HU-029): el filtro "Tipo" viaja como `type`. */
const TYPE_OPTIONS: { value: InboxEntryType; label: string }[] = [
  { value: 'APPOINTMENT_REQUEST', label: 'Citas especializadas' },
  { value: 'RESCHEDULE_REQUEST', label: 'Reprogramaciones' },
];

function isEntryType(value: string | null): value is InboxEntryType {
  return TYPE_OPTIONS.some((option) => option.value === value);
}

type FilterKey = 'type' | 'siteId' | 'professionalId' | 'specialtyId' | 'date';
type FilterValues = Record<FilterKey, string>;
const NO_FILTERS: FilterValues = { type: '', siteId: '', professionalId: '', specialtyId: '', date: '' };

function toQuery(values: FilterValues): InboxFilters {
  return {
    type: isEntryType(values.type) ? values.type : undefined,
    siteId: values.siteId === '' ? undefined : Number(values.siteId),
    professionalId: values.professionalId === '' ? undefined : Number(values.professionalId),
    specialtyId: values.specialtyId === '' ? undefined : Number(values.specialtyId),
    date: values.date === '' ? undefined : values.date,
  };
}

/** Clave estable de una entrada: una reprogramación se identifica por la solicitud, no por la cita. */
function entryKey(entry: InboxEntry): string {
  return entry.type === 'RESCHEDULE_REQUEST'
    ? `reprogramacion-${entry.reschedule.id}`
    : `cita-${entry.appointment.id}`;
}

function describe(entry: InboxEntry): string {
  const { appointment } = entry;
  if (entry.type === 'RESCHEDULE_REQUEST') {
    const { proposed } = entry.reschedule;
    return `${appointment.specialty.name} de ${appointment.patient.fullName}, nueva franja ${formatShortDate(proposed.date)} ${proposed.startTime}`;
  }
  return `${appointment.specialty.name} de ${appointment.patient.fullName}, ${formatShortDate(appointment.date)} ${appointment.startTime}`;
}

function kindLabel(entry: InboxEntry): string {
  return entry.type === 'RESCHEDULE_REQUEST' ? 'reprogramación' : 'solicitud';
}

/**
 * Bandeja de pendientes (HU-029, HU-030, HU-031): solicitudes especializadas REQUESTED y
 * reprogramaciones PENDING, con filtros (en una reprogramación, fecha y sede se aplican a la
 * franja propuesta, D24). Aprobar pide confirmación; rechazar exige motivo. Lo decidido sale de
 * la lista; un 409 (ya decidida, vencida o cambio concurrente) informa y recarga.
 */
export function InboxPage() {
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<FilterValues>(() => {
    const type = searchParams.get('tipo');
    return { ...NO_FILTERS, type: isEntryType(type) ? type : '' };
  });
  const options = useResource(loadFilterOptions, []);
  const inbox = useResource((signal) => getInbox(toQuery(filters), signal), [
    filters.type,
    filters.siteId,
    filters.professionalId,
    filters.specialtyId,
    filters.date,
  ]);

  const [approving, setApproving] = useState<InboxEntry | null>(null);
  const [rejecting, setRejecting] = useState<InboxEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  function setFilter(key: FilterKey, value: string) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  function removeFromList(target: InboxEntry) {
    const key = entryKey(target);
    inbox.update((entries) => entries.filter((entry) => entryKey(entry) !== key));
  }

  /** 409: la solicitud ya cambió (otra decisión, vencida). Se informa y se recarga la bandeja. */
  function handleConflict(error: ApiError) {
    toast.show({ tone: 'error', title: 'La solicitud ya no se puede decidir', description: error.message });
    inbox.reload({ silent: true });
  }

  async function confirmApprove() {
    if (approving === null || busy) return;
    setBusy(true);
    setApproveError(null);
    try {
      if (approving.type === 'RESCHEDULE_REQUEST') await approveReschedule(approving.reschedule.id);
      else await approveAppointment(approving.appointment.id);
      removeFromList(approving);
      toast.show({
        title: approving.type === 'RESCHEDULE_REQUEST' ? 'Reprogramación aprobada' : 'Solicitud aprobada',
        description: describe(approving),
      });
      setApproving(null);
    } catch (cause) {
      const error = toApiError(cause);
      if (error.status === 409) {
        setApproving(null);
        handleConflict(error);
      } else {
        setApproveError(error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<InboxEntry>[] = [
    {
      key: 'patient',
      header: 'Paciente',
      primary: true,
      render: ({ appointment }) => (
        <span className="person__text">
          <span className="person__name">{appointment.patient.fullName}</span>
          <span className="person__meta">
            {appointment.patient.documentType} {appointment.patient.documentNumber}
          </span>
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (entry) =>
        entry.type === 'RESCHEDULE_REQUEST' ? (
          <span className="person__text">
            <Badge tone="info">Reprogramación</Badge>
            <span className="person__meta">
              {(entry.reschedule.requestReason ?? '') !== ''
                ? `Motivo: ${entry.reschedule.requestReason}`
                : 'Sin motivo indicado'}
            </span>
          </span>
        ) : (
          <Badge tone="warning">Cita especializada</Badge>
        ),
    },
    { key: 'specialty', header: 'Especialidad', render: ({ appointment }) => appointment.specialty.name },
    { key: 'professional', header: 'Profesional', render: ({ appointment }) => appointment.professional.fullName },
    {
      key: 'site',
      header: 'Sede',
      // En una reprogramación la sede puede cambiar (D21): se muestra la propuesta; el detalle de
      // ambos lados está en la columna de fecha.
      render: (entry) =>
        entry.type === 'RESCHEDULE_REQUEST' ? entry.reschedule.proposed.site.name : entry.appointment.site.name,
    },
    {
      key: 'when',
      header: 'Fecha y hora',
      render: (entry) =>
        entry.type === 'RESCHEDULE_REQUEST' ? (
          <SlotChange previous={entry.reschedule.previous} proposed={entry.reschedule.proposed} />
        ) : (
          <span>
            <span style={{ textTransform: 'capitalize' }}>{formatShortDate(entry.appointment.date)}</span>
            <br />
            {entry.appointment.startTime} – {entry.appointment.endTime}
          </span>
        ),
    },
    { key: 'duration', header: 'Duración', render: ({ appointment }) => `${appointment.durationMinutes} min` },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'end',
      render: (entry) => (
        <span className="cluster">
          <button
            type="button"
            className="button button--success button--sm"
            aria-label={`Aprobar ${kindLabel(entry)} de ${entry.appointment.patient.fullName}`}
            onClick={() => {
              setApproveError(null);
              setApproving(entry);
            }}
          >
            <CircleCheck size={16} aria-hidden="true" />
            Aprobar
          </button>
          <button
            type="button"
            className="button button--danger-outline button--sm"
            aria-label={`Rechazar ${kindLabel(entry)} de ${entry.appointment.patient.fullName}`}
            onClick={() => setRejecting(entry)}
          >
            <CircleX size={16} aria-hidden="true" />
            Rechazar
          </button>
        </span>
      ),
    },
  ];

  const hasFilters = Object.values(filters).some((value) => value !== '');
  const optionsReady = options.state.status === 'ready' ? options.state.data : null;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Administración"
        title="Solicitudes pendientes"
        description="Citas especializadas y reprogramaciones que esperan tu decisión. Al rechazar, el motivo es obligatorio y el paciente lo verá."
      />

      <section className="filters" aria-label="Filtros">
        <SelectField
          label="Tipo"
          placeholder="Todas"
          options={TYPE_OPTIONS}
          value={filters.type}
          onChange={(event) => setFilter('type', event.target.value)}
        />
        <SelectField
          label="Sede"
          placeholder="Todas"
          options={optionsReady?.sites ?? []}
          value={filters.siteId}
          onChange={(event) => setFilter('siteId', event.target.value)}
        />
        <SelectField
          label="Profesional"
          placeholder="Todos"
          options={optionsReady?.professionals ?? []}
          value={filters.professionalId}
          onChange={(event) => setFilter('professionalId', event.target.value)}
        />
        <SelectField
          label="Especialidad"
          placeholder="Todas"
          options={optionsReady?.specialties ?? []}
          value={filters.specialtyId}
          onChange={(event) => setFilter('specialtyId', event.target.value)}
        />
        <div className="field">
          <label className="field__label" htmlFor="filtro-fecha-bandeja">
            Fecha
          </label>
          <input
            id="filtro-fecha-bandeja"
            type="date"
            className="field__input"
            value={filters.date}
            onChange={(event) => setFilter('date', event.target.value)}
          />
        </div>
        {hasFilters ? (
          <div>
            <button type="button" className="button button--ghost" onClick={() => setFilters(NO_FILTERS)}>
              <X size={16} aria-hidden="true" />
              Limpiar filtros
            </button>
          </div>
        ) : null}
      </section>
      {options.state.status === 'error' ? (
        <p className="field__hint">No se pudieron cargar las opciones de filtro: {options.state.error.message}</p>
      ) : null}
      {filters.type !== 'APPOINTMENT_REQUEST' && (filters.date !== '' || filters.siteId !== '') ? (
        <p className="field__hint">En las reprogramaciones, la fecha y la sede se aplican a la franja propuesta.</p>
      ) : null}

      <section aria-label="Solicitudes" aria-busy={inbox.state.status === 'loading'}>
        {inbox.state.status === 'loading' ? <LoadingSection label="Cargando solicitudes…" variant="row" count={4} /> : null}
        {inbox.state.status === 'error' ? (
          <ErrorState error={inbox.state.error} onRetry={() => inbox.reload()} />
        ) : null}
        {inbox.state.status === 'ready' && inbox.state.data.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<Inbox size={36} />}
              title="Sin solicitudes con estos filtros"
              action={
                <button type="button" className="button button--ghost" onClick={() => setFilters(NO_FILTERS)}>
                  Limpiar filtros
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={<PartyPopper size={36} />}
              title="¡Todo al día! No hay solicitudes pendientes"
              description="Cuando un paciente solicite una cita especializada o una reprogramación aparecerá aquí."
            />
          )
        ) : null}
        {inbox.state.status === 'ready' && inbox.state.data.length > 0 ? (
          <div className="stack stack--sm">
            <p className="muted text-sm" aria-live="polite">
              <Badge tone="warning">{inbox.state.data.length}</Badge>{' '}
              {inbox.state.data.length === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'}
            </p>
            <DataTable
              caption="Solicitudes pendientes"
              columns={columns}
              rows={inbox.state.data}
              rowKey={entryKey}
            />
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={approving !== null}
        title={approving?.type === 'RESCHEDULE_REQUEST' ? '¿Aprobar esta reprogramación?' : '¿Aprobar esta solicitud?'}
        confirmLabel="Aprobar"
        busy={busy}
        error={approveError}
        onCancel={() => setApproving(null)}
        onConfirm={() => void confirmApprove()}
      >
        {approving?.type === 'RESCHEDULE_REQUEST' ? (
          <>
            <p>
              La cita de <strong>{approving.appointment.specialty.name}</strong> de{' '}
              {approving.appointment.patient.fullName} con {approving.appointment.professional.fullName} se{' '}
              <strong>moverá</strong> a la franja propuesta. La franja actual quedará libre.
            </p>
            <SlotChange previous={approving.reschedule.previous} proposed={approving.reschedule.proposed} />
          </>
        ) : approving !== null ? (
          <p>
            La cita de <strong>{approving.appointment.specialty.name}</strong> de {approving.appointment.patient.fullName}{' '}
            con {approving.appointment.professional.fullName} ({approving.appointment.site.name}) quedará{' '}
            <strong>aprobada</strong> para el {formatShortDate(approving.appointment.date)} a las{' '}
            {approving.appointment.startTime}.
          </p>
        ) : null}
      </ConfirmDialog>

      <RejectDialog
        entry={rejecting}
        onClose={() => setRejecting(null)}
        onRejected={(entry) => {
          removeFromList(entry);
          toast.show({
            title: entry.type === 'RESCHEDULE_REQUEST' ? 'Reprogramación rechazada' : 'Solicitud rechazada',
            description: describe(entry),
          });
          setRejecting(null);
        }}
        onConflict={(error) => {
          setRejecting(null);
          handleConflict(error);
        }}
      />
    </div>
  );
}

/**
 * Rechazo con motivo obligatorio (1–500 caracteres): solicitud especializada (HU-030 CA-03) o
 * reprogramación (HU-031 CA-04, la cita conserva su franja).
 */
function RejectDialog(props: {
  entry: InboxEntry | null;
  onClose: () => void;
  onRejected: (entry: InboxEntry) => void;
  onConflict: (error: ApiError) => void;
}) {
  if (props.entry === null) return null;
  return <RejectForm {...props} entry={props.entry} />;
}

function RejectForm({
  entry,
  onClose,
  onRejected,
  onConflict,
}: {
  entry: InboxEntry;
  onClose: () => void;
  onRejected: (entry: InboxEntry) => void;
  onConflict: (error: ApiError) => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const trimmed = reason.trim();
  const { appointment } = entry;
  const isReschedule = entry.type === 'RESCHEDULE_REQUEST';
  const label = isReschedule ? 'Rechazar reprogramación' : 'Rechazar solicitud';
  const when =
    entry.type === 'RESCHEDULE_REQUEST'
      ? `nueva franja ${formatShortDate(entry.reschedule.proposed.date)} ${entry.reschedule.proposed.startTime}`
      : `${formatShortDate(appointment.date)} ${appointment.startTime}`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    if (trimmed === '') {
      setFieldError('Escribe el motivo del rechazo.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (entry.type === 'RESCHEDULE_REQUEST') await rejectReschedule(entry.reschedule.id, trimmed);
      else await rejectAppointment(appointment.id, trimmed);
      onRejected(entry);
    } catch (cause) {
      const failure = toApiError(cause);
      if (failure.status === 409) {
        onConflict(failure);
        return;
      }
      setError(failure.message);
      setFieldError(failure.fieldErrors.reason);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={label}
      description={`${appointment.specialty.name} · ${appointment.patient.fullName} · ${when}`}
      onClose={onClose}
      dismissible={!saving}
    >
      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {error !== null ? <FormAlert tone="error" title={error} /> : null}
        <TextAreaField
          label="Motivo del rechazo"
          required
          counterMax={REJECTION_REASON_MAX}
          hint={
            isReschedule
              ? 'El paciente verá este motivo; su cita se mantiene en la franja actual.'
              : 'El paciente verá este motivo en el detalle de su cita.'
          }
          value={reason}
          error={fieldError}
          disabled={saving}
          onChange={(event) => {
            setReason(event.target.value);
            setFieldError(undefined);
          }}
        />
        <div className="form-actions">
          <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <SubmitButton loading={saving} disabled={trimmed === ''} tone="danger" keepLabel>
            {label}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
