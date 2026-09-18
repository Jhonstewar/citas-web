import { ClipboardList, Lock, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toApiError, type ApiError } from '../../api/ApiError';
import { deleteSpecialty, listSpecialties, setSpecialtyActive } from '../../api/adminApi';
import { ERROR_CODES, type Specialty } from '../../api/contracts';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { FormAlert } from '../../components/FormAlert';
import { Modal } from '../../components/Modal';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { Badge } from '../../components/StatusBadge';
import { useToast } from '../../components/toastContext';
import { useResource } from '../../lib/useResource';
import { SpecialtyFormModal } from './SpecialtyFormModal';

type Editing = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; specialty: Specialty };

/**
 * Especialidades (HU-011): tipo, duración y estado; alta, edición, activar/desactivar y borrado.
 * Una especialidad en uso no se borra (409 SPECIALTY_REFERENCED): se propone desactivarla.
 */
export function SpecialtiesPage() {
  const toast = useToast();
  const specialties = useResource((signal) => listSpecialties(signal), []);
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [toggling, setToggling] = useState<Specialty | null>(null);
  const [toDelete, setToDelete] = useState<Specialty | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function replace(saved: Specialty) {
    specialties.update((list) => {
      const exists = list.some((item) => item.id === saved.id);
      return exists ? list.map((item) => (item.id === saved.id ? saved : item)) : [...list, saved];
    });
  }

  async function changeStatus(specialty: Specialty, active: boolean): Promise<ApiError | null> {
    try {
      const saved = await setSpecialtyActive(specialty.id, active);
      replace(saved);
      toast.show({ title: active ? 'Especialidad activada' : 'Especialidad desactivada', description: saved.name });
      return null;
    } catch (cause) {
      return toApiError(cause);
    }
  }

  async function confirmToggle() {
    if (toggling === null) return;
    setBusy(true);
    setActionError(null);
    const error = await changeStatus(toggling, !toggling.active);
    setBusy(false);
    if (error === null) setToggling(null);
    else setActionError(error.message);
  }

  const columns: Column<Specialty>[] = [
    {
      key: 'name',
      header: 'Nombre',
      primary: true,
      render: (item) => (
        <span className="person__text">
          <span className="person__name">
            {item.name}{' '}
            {item.protected ? (
              <Badge tone="info" icon={<Lock size={12} aria-hidden="true" />}>
                Protegida
              </Badge>
            ) : null}
          </span>
          <span className="person__meta">{item.code}</span>
        </span>
      ),
    },
    {
      key: 'type',
      header: 'Tipo',
      render: (item) =>
        item.appointmentType === 'GENERAL' ? (
          <Badge tone="success">General</Badge>
        ) : (
          <Badge tone="warning">Especializada · requiere aprobación</Badge>
        ),
    },
    { key: 'duration', header: 'Duración', render: (item) => `${item.durationMinutes} min` },
    {
      key: 'status',
      header: 'Estado',
      render: (item) => (item.active ? <Badge tone="success">Activa</Badge> : <Badge>Inactiva</Badge>),
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'end',
      render: (item) => (
        <span className="cluster">
          <button
            type="button"
            className="button button--ghost button--sm"
            aria-label={`Editar ${item.name}`}
            onClick={() => setEditing({ mode: 'edit', specialty: item })}
          >
            <Pencil size={14} aria-hidden="true" />
            Editar
          </button>
          {item.protected ? null : (
            <>
              <button
                type="button"
                className="button button--ghost button--sm"
                aria-label={`${item.active ? 'Desactivar' : 'Activar'} ${item.name}`}
                onClick={() => {
                  setActionError(null);
                  setToggling(item);
                }}
              >
                <Power size={14} aria-hidden="true" />
                {item.active ? 'Desactivar' : 'Activar'}
              </button>
              <button
                type="button"
                className="button button--danger-outline button--sm"
                aria-label={`Eliminar ${item.name}`}
                onClick={() => setToDelete(item)}
              >
                <Trash2 size={14} aria-hidden="true" />
                Eliminar
              </button>
            </>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Administración"
        title="Especialidades"
        description="Cada especialidad fija el tipo de cita y su duración (30 o 60 minutos)."
        actions={
          <button type="button" className="button button--primary" onClick={() => setEditing({ mode: 'create' })}>
            <Plus size={18} aria-hidden="true" />
            Nueva especialidad
          </button>
        }
      />

      <section aria-label="Listado de especialidades" aria-busy={specialties.state.status === 'loading'}>
        {specialties.state.status === 'loading' ? <LoadingSection variant="row" count={4} /> : null}
        {specialties.state.status === 'error' ? (
          <ErrorState error={specialties.state.error} onRetry={() => specialties.reload()} />
        ) : null}
        {specialties.state.status === 'ready' && specialties.state.data.length === 0 ? (
          <EmptyState
            icon={<ClipboardList size={36} />}
            title="Aún no hay especialidades"
            action={
              <button type="button" className="button button--primary" onClick={() => setEditing({ mode: 'create' })}>
                Crear especialidad
              </button>
            }
          />
        ) : null}
        {specialties.state.status === 'ready' && specialties.state.data.length > 0 ? (
          <DataTable
            caption="Especialidades"
            columns={columns}
            rows={[...specialties.state.data].sort((a, b) => a.name.localeCompare(b.name, 'es'))}
            rowKey={(item) => item.id}
          />
        ) : null}
      </section>

      <SpecialtyFormModal
        open={editing.mode !== 'closed'}
        specialty={editing.mode === 'edit' ? editing.specialty : null}
        onClose={() => setEditing({ mode: 'closed' })}
        onSaved={(saved, created) => {
          replace(saved);
          setEditing({ mode: 'closed' });
          toast.show({ title: created ? 'Especialidad creada' : 'Especialidad actualizada', description: saved.name });
        }}
      />

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.active === true ? '¿Desactivar esta especialidad?' : '¿Activar esta especialidad?'}
        confirmLabel={toggling?.active === true ? 'Desactivar' : 'Activar'}
        tone={toggling?.active === true ? 'danger' : 'primary'}
        busy={busy}
        error={actionError}
        onCancel={() => setToggling(null)}
        onConfirm={() => void confirmToggle()}
      >
        {toggling !== null ? (
          <p>
            {toggling.active
              ? `${toggling.name} dejará de ofrecerse para nuevas reservas. Las citas existentes se conservan.`
              : `${toggling.name} volverá a ofrecerse para nuevas reservas.`}
          </p>
        ) : null}
      </ConfirmDialog>

      {toDelete !== null ? (
        <DeleteSpecialtyDialog
          specialty={toDelete}
          onClose={() => setToDelete(null)}
          onDeleted={() => {
            const removed = toDelete;
            specialties.update((list) => list.filter((item) => item.id !== removed.id));
            setToDelete(null);
            toast.show({ title: 'Especialidad eliminada', description: removed.name });
          }}
          onDeactivate={async () => {
            const error = await changeStatus(toDelete, false);
            if (error === null) setToDelete(null);
            return error;
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Borrado con confirmación. Si la especialidad está en uso (409 SPECIALTY_REFERENCED), no se
 * borra físicamente (RF-06): se explica y se ofrece desactivarla en su lugar.
 */
function DeleteSpecialtyDialog({
  specialty,
  onClose,
  onDeleted,
  onDeactivate,
}: {
  specialty: Specialty;
  onClose: () => void;
  onDeleted: () => void;
  onDeactivate: () => Promise<ApiError | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const referenced = error?.code === ERROR_CODES.specialtyReferenced;

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await deleteSpecialty(specialty.id);
      onDeleted();
    } catch (cause) {
      setError(toApiError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    const failure = await onDeactivate();
    setBusy(false);
    if (failure !== null) setError(failure);
  }

  return (
    <Modal
      open
      role="alertdialog"
      size="sm"
      title="¿Eliminar esta especialidad?"
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          {referenced && specialty.active ? (
            <button type="button" className="button button--primary" onClick={() => void deactivate()} disabled={busy}>
              <Power size={16} aria-hidden="true" />
              Desactivar en su lugar
            </button>
          ) : null}
          {referenced ? null : (
            <button type="button" className="button button--danger" onClick={() => void remove()} disabled={busy}>
              <Trash2 size={16} aria-hidden="true" />
              Eliminar
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        <p>
          Se eliminará <strong>{specialty.name}</strong> de forma permanente. Solo es posible si
          ningún profesional ni cita la usa.
        </p>
        {referenced ? (
          <FormAlert tone="info" title="Está en uso: desactívala en lugar de borrarla.">
            <p>{error?.message}</p>
          </FormAlert>
        ) : error !== null ? (
          <FormAlert tone="error" title={error.message} />
        ) : null}
      </div>
    </Modal>
  );
}
