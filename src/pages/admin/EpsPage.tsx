import { Building2, ListTree, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toApiError, type ApiError } from '../../api/ApiError';
import { deleteEps, listEps, setEpsActive } from '../../api/adminApi';
import { ERROR_CODES, type Eps } from '../../api/contracts';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { Badge } from '../../components/StatusBadge';
import { useToast } from '../../components/toastContext';
import { useResource } from '../../lib/useResource';
import { DeleteReferencedDialog } from './DeleteReferencedDialog';
import { EpsFormModal } from './EpsFormModals';

type Editing = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; eps: Eps };

function plansLabel(count: number): string {
  return count === 1 ? '1 plan' : `${count} planes`;
}

/**
 * EPS (HU-012): listado con código, nombre, número de planes y estado; alta, edición del nombre,
 * activar/desactivar y borrado. Una EPS con planes no se borra (409 EPS_REFERENCED, D28): se
 * propone desactivarla, lo que la retira de las afiliaciones nuevas sin tocar las existentes.
 */
export function EpsPage() {
  const toast = useToast();
  const epsList = useResource((signal) => listEps(signal), []);
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [toggling, setToggling] = useState<Eps | null>(null);
  const [toDelete, setToDelete] = useState<Eps | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  function replace(saved: Eps) {
    epsList.update((list) => {
      const exists = list.some((item) => item.id === saved.id);
      return exists ? list.map((item) => (item.id === saved.id ? saved : item)) : [...list, saved];
    });
  }

  async function changeStatus(eps: Eps, active: boolean): Promise<ApiError | null> {
    try {
      const saved = await setEpsActive(eps.id, active);
      replace(saved);
      toast.show({ title: active ? 'EPS activada' : 'EPS desactivada', description: saved.name });
      return null;
    } catch (cause) {
      return toApiError(cause);
    }
  }

  async function confirmToggle() {
    if (toggling === null || busy) return;
    setBusy(true);
    setActionError(null);
    const error = await changeStatus(toggling, !toggling.active);
    setBusy(false);
    if (error === null) setToggling(null);
    else setActionError(error.message);
  }

  const columns: Column<Eps>[] = [
    {
      key: 'name',
      header: 'Nombre',
      primary: true,
      render: (item) => (
        <span className="person__text">
          <span className="person__name">{item.name}</span>
          <span className="person__meta">{item.code}</span>
        </span>
      ),
    },
    { key: 'plans', header: 'Planes', render: (item) => plansLabel(item.planCount) },
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
          <Link
            className="button button--ghost button--sm button--link"
            to={`/admin/eps/${item.id}`}
            aria-label={`Ver planes de ${item.name}`}
          >
            <ListTree size={14} aria-hidden="true" />
            Planes
          </Link>
          <button
            type="button"
            className="button button--ghost button--sm"
            aria-label={`Editar ${item.name}`}
            onClick={() => setEditing({ mode: 'edit', eps: item })}
          >
            <Pencil size={14} aria-hidden="true" />
            Editar
          </button>
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
        </span>
      ),
    },
  ];

  const createButton = (label: string) => (
    <button type="button" className="button button--primary" onClick={() => setEditing({ mode: 'create' })}>
      <Plus size={18} aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Administración"
        title="EPS y planes"
        description="EPS de demostración y sus planes. Desactivar una EPS la retira de las afiliaciones nuevas sin tocar las existentes."
        actions={createButton('Nueva EPS')}
      />

      <section aria-label="Listado de EPS" aria-busy={epsList.state.status === 'loading'}>
        {epsList.state.status === 'loading' ? <LoadingSection label="Cargando EPS…" variant="row" count={4} /> : null}
        {epsList.state.status === 'error' ? (
          <ErrorState error={epsList.state.error} onRetry={() => epsList.reload()} />
        ) : null}
        {epsList.state.status === 'ready' && epsList.state.data.length === 0 ? (
          <EmptyState icon={<Building2 size={36} />} title="Aún no hay EPS" action={createButton('Crear EPS')} />
        ) : null}
        {epsList.state.status === 'ready' && epsList.state.data.length > 0 ? (
          <DataTable
            caption="EPS"
            columns={columns}
            rows={[...epsList.state.data].sort((a, b) => a.name.localeCompare(b.name, 'es'))}
            rowKey={(item) => item.id}
          />
        ) : null}
      </section>

      <EpsFormModal
        open={editing.mode !== 'closed'}
        eps={editing.mode === 'edit' ? editing.eps : null}
        onClose={() => setEditing({ mode: 'closed' })}
        onSaved={(saved, created) => {
          replace(saved);
          setEditing({ mode: 'closed' });
          toast.show({ title: created ? 'EPS creada' : 'EPS actualizada', description: saved.name });
        }}
      />

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.active === true ? '¿Desactivar esta EPS?' : '¿Activar esta EPS?'}
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
              ? `${toggling.name} y sus planes dejarán de ofrecerse para afiliaciones nuevas. Las afiliaciones existentes se conservan.`
              : `${toggling.name} volverá a ofrecerse para afiliaciones nuevas.`}
          </p>
        ) : null}
      </ConfirmDialog>

      {toDelete !== null ? (
        <DeleteReferencedDialog
          title="¿Eliminar esta EPS?"
          referencedCode={ERROR_CODES.epsReferenced}
          referencedTitle="Tiene planes: desactívala en lugar de borrarla."
          active={toDelete.active}
          remove={() => deleteEps(toDelete.id)}
          onClose={() => setToDelete(null)}
          onDeleted={() => {
            const removed = toDelete;
            epsList.update((list) => list.filter((item) => item.id !== removed.id));
            setToDelete(null);
            toast.show({ title: 'EPS eliminada', description: removed.name });
          }}
          onDeactivate={async () => {
            const error = await changeStatus(toDelete, false);
            if (error === null) setToDelete(null);
            return error;
          }}
        >
          <p>
            Se eliminará <strong>{toDelete.name}</strong> de forma permanente. Solo es posible si no
            tiene planes ni afiliaciones.
          </p>
        </DeleteReferencedDialog>
      ) : null}
    </div>
  );
}
