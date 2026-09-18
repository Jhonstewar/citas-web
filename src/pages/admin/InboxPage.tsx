import { CircleCheck, CircleX, Inbox, PartyPopper, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toApiError, type ApiError } from '../../api/ApiError';
import {
  approveAppointment,
  getInbox,
  listProfessionals,
  listSpecialties,
  rejectAppointment,
} from '../../api/adminApi';
import { getSites } from '../../api/catalogApi';
import {
  REJECTION_REASON_MAX,
  type AdminAppointment,
  type InboxEntry,
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
import { useToast } from '../../components/toastContext';
import { formatShortDate } from '../../lib/dates';
import { useResource } from '../../lib/useResource';

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

type FilterKey = 'siteId' | 'professionalId' | 'specialtyId' | 'date';
type FilterValues = Record<FilterKey, string>;
const NO_FILTERS: FilterValues = { siteId: '', professionalId: '', specialtyId: '', date: '' };

function toQuery(values: FilterValues): InboxFilters {
  return {
    siteId: values.siteId === '' ? undefined : Number(values.siteId),
    professionalId: values.professionalId === '' ? undefined : Number(values.professionalId),
    specialtyId: values.specialtyId === '' ? undefined : Number(values.specialtyId),
    date: values.date === '' ? undefined : values.date,
  };
}

function describe(appointment: AdminAppointment): string {
  return `${appointment.specialty.name} de ${appointment.patient.fullName}, ${formatShortDate(appointment.date)} ${appointment.startTime}`;
}

/**
 * Bandeja de solicitudes (HU-029, HU-030): solicitudes especializadas REQUESTED con filtros;
 * aprobar con confirmación y rechazar con motivo obligatorio. Lo decidido sale de la lista.
 */
export function InboxPage() {
  const toast = useToast();
  const [filters, setFilters] = useState<FilterValues>(NO_FILTERS);
  const options = useResource(loadFilterOptions, []);
  const inbox = useResource((signal) => getInbox(toQuery(filters), signal), [
    filters.siteId,
    filters.professionalId,
    filters.specialtyId,
    filters.date,
  ]);

  const [approving, setApproving] = useState<AdminAppointment | null>(null);
  const [rejecting, setRejecting] = useState<AdminAppointment | null>(null);
  const [busy, setBusy] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  function setFilter(key: FilterKey, value: string) {
    setFilters((previous) => ({ ...previous, [key]: value }));
  }

  function removeFromList(id: number) {
    inbox.update((entries) => entries.filter((entry) => entry.appointment.id !== id));
  }

  /** 409: la solicitud ya cambió (otra decisión, vencida). Se informa y se recarga la bandeja. */
  function handleConflict(error: ApiError) {
    toast.show({ tone: 'error', title: 'La solicitud ya no se puede decidir', description: error.message });
    inbox.reload({ silent: true });
  }

  async function confirmApprove() {
    if (approving === null) return;
    setBusy(true);
    setApproveError(null);
    try {
      await approveAppointment(approving.id);
      removeFromList(approving.id);
      toast.show({ title: 'Solicitud aprobada', description: describe(approving) });
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
    { key: 'specialty', header: 'Especialidad', render: ({ appointment }) => appointment.specialty.name },
    { key: 'professional', header: 'Profesional', render: ({ appointment }) => appointment.professional.fullName },
    { key: 'site', header: 'Sede', render: ({ appointment }) => appointment.site.name },
    {
      key: 'when',
      header: 'Fecha y hora',
      render: ({ appointment }) => (
        <span>
          <span style={{ textTransform: 'capitalize' }}>{formatShortDate(appointment.date)}</span>
          <br />
          {appointment.startTime} – {appointment.endTime}
        </span>
      ),
    },
    { key: 'duration', header: 'Duración', render: ({ appointment }) => `${appointment.durationMinutes} min` },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'end',
      render: ({ appointment }) => (
        <span className="cluster">
          <button
            type="button"
            className="button button--success button--sm"
            aria-label={`Aprobar solicitud de ${appointment.patient.fullName}`}
            onClick={() => {
              setApproveError(null);
              setApproving(appointment);
            }}
          >
            <CircleCheck size={16} aria-hidden="true" />
            Aprobar
          </button>
          <button
            type="button"
            className="button button--danger-outline button--sm"
            aria-label={`Rechazar solicitud de ${appointment.patient.fullName}`}
            onClick={() => setRejecting(appointment)}
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
        description="Citas especializadas que esperan tu decisión. Al rechazar, el motivo es obligatorio y el paciente lo verá."
      />

      <section className="filters" aria-label="Filtros">
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
              description="Cuando un paciente solicite una cita especializada aparecerá aquí."
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
              rowKey={(entry) => entry.appointment.id}
            />
          </div>
        ) : null}
      </section>

      <ConfirmDialog
        open={approving !== null}
        title="¿Aprobar esta solicitud?"
        confirmLabel="Aprobar"
        busy={busy}
        error={approveError}
        onCancel={() => setApproving(null)}
        onConfirm={() => void confirmApprove()}
      >
        {approving !== null ? (
          <p>
            La cita de <strong>{approving.specialty.name}</strong> de {approving.patient.fullName} con{' '}
            {approving.professional.fullName} ({approving.site.name}) quedará <strong>aprobada</strong> para el{' '}
            {formatShortDate(approving.date)} a las {approving.startTime}.
          </p>
        ) : null}
      </ConfirmDialog>

      <RejectDialog
        appointment={rejecting}
        onClose={() => setRejecting(null)}
        onRejected={(appointment) => {
          removeFromList(appointment.id);
          toast.show({ title: 'Solicitud rechazada', description: describe(appointment) });
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

/** Rechazo con motivo obligatorio (1–500 caracteres, HU-030 CA-03). */
function RejectDialog(props: {
  appointment: AdminAppointment | null;
  onClose: () => void;
  onRejected: (appointment: AdminAppointment) => void;
  onConflict: (error: ApiError) => void;
}) {
  if (props.appointment === null) return null;
  return <RejectForm {...props} appointment={props.appointment} />;
}

function RejectForm({
  appointment,
  onClose,
  onRejected,
  onConflict,
}: {
  appointment: AdminAppointment;
  onClose: () => void;
  onRejected: (appointment: AdminAppointment) => void;
  onConflict: (error: ApiError) => void;
}) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const trimmed = reason.trim();

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
      await rejectAppointment(appointment.id, trimmed);
      onRejected(appointment);
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
      title="Rechazar solicitud"
      description={`${appointment.specialty.name} · ${appointment.patient.fullName} · ${formatShortDate(appointment.date)} ${appointment.startTime}`}
      onClose={onClose}
      dismissible={!saving}
    >
      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {error !== null ? <FormAlert tone="error" title={error} /> : null}
        <TextAreaField
          label="Motivo del rechazo"
          required
          counterMax={REJECTION_REASON_MAX}
          hint="El paciente verá este motivo en el detalle de su cita."
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
          <button
            type="submit"
            className="button button--danger"
            disabled={saving || trimmed === ''}
            aria-busy={saving}
          >
            {saving ? <span className="button__spinner" aria-hidden="true" /> : null}
            Rechazar solicitud
          </button>
        </div>
      </form>
    </Modal>
  );
}
