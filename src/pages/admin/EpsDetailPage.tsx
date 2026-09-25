import { ListTree, Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useParams } from 'react-router';
import { toApiError, type ApiError } from '../../api/ApiError';
import { deleteEpsPlan, getEps, listEpsPlans, setEpsPlanActive } from '../../api/adminApi';
import { getRegimes } from '../../api/catalogApi';
import { ERROR_CODES, type Eps, type EpsPlan } from '../../api/contracts';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { Badge } from '../../components/StatusBadge';
import { useToast } from '../../components/toastContext';
import { notFound } from '../../lib/notFound';
import { useResource } from '../../lib/useResource';
import { DeleteReferencedDialog } from './DeleteReferencedDialog';
import { EpsPlanFormModal } from './EpsFormModals';

type Editing = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; plan: EpsPlan };

interface DetailData {
  eps: Eps;
  plans: EpsPlan[];
}

/**
 * La EPS se pide por id (`GET /api/admin/eps/{id}`, aclaración 9 del contrato S4) junto con sus
 * planes. Un 404 del servidor se muestra como "No encontramos esta EPS"; un id no numérico se
 * presenta igual y ni se pide.
 */
function loadDetail(id: number, signal: AbortSignal): Promise<DetailData> {
  if (!Number.isInteger(id) || id <= 0) return Promise.reject(notFound());
  return Promise.all([getEps(id, signal), listEpsPlans(id, signal)]).then(([eps, plans]) => ({
    eps,
    plans,
  }));
}

/**
 * Planes de una EPS (HU-012): código, nombre, régimen y estado; alta (código inmutable después),
 * edición de nombre y régimen, activar/desactivar y borrado. Un plan con afiliaciones no se
 * borra (409 PLAN_REFERENCED, D28): se propone desactivarlo.
 */
export function EpsDetailPage() {
  const id = Number(useParams().id);
  const toast = useToast();
  const data = useResource((signal) => loadDetail(id, signal), [id]);
  const regimes = useResource((signal) => getRegimes(signal), []);
  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [toggling, setToggling] = useState<EpsPlan | null>(null);
  const [toDelete, setToDelete] = useState<EpsPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const back = { to: '/admin/eps', label: 'EPS y planes' };

  function replace(saved: EpsPlan) {
    data.update((current) => {
      const exists = current.plans.some((plan) => plan.id === saved.id);
      return {
        ...current,
        plans: exists
          ? current.plans.map((plan) => (plan.id === saved.id ? saved : plan))
          : [...current.plans, saved],
      };
    });
  }

  async function changeStatus(plan: EpsPlan, active: boolean): Promise<ApiError | null> {
    try {
      const saved = await setEpsPlanActive(plan.id, active);
      replace(saved);
      toast.show({ title: active ? 'Plan activado' : 'Plan desactivado', description: saved.name });
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

  if (data.state.status === 'loading') {
    return (
      <div className="page">
        <PageHeader title="Planes de la EPS" back={back} />
        <LoadingSection label="Cargando planes…" variant="row" count={3} />
      </div>
    );
  }
  if (data.state.status === 'error') {
    return (
      <div className="page">
        <PageHeader title="Planes de la EPS" back={back} />
        <ErrorState
          error={data.state.error}
          title={data.state.error.kind === 'not_found' ? 'No encontramos esta EPS' : undefined}
          onRetry={() => data.reload()}
        />
      </div>
    );
  }

  const { eps, plans } = data.state.data;
  const regimeList = regimes.state.status === 'ready' ? regimes.state.data : [];
  const canEdit = regimes.state.status === 'ready';

  const columns: Column<EpsPlan>[] = [
    {
      key: 'name',
      header: 'Nombre',
      primary: true,
      render: (plan) => (
        <span className="person__text">
          <span className="person__name">{plan.name}</span>
          <span className="person__meta">{plan.code}</span>
        </span>
      ),
    },
    { key: 'regime', header: 'Régimen', render: (plan) => plan.regime.name },
    {
      key: 'status',
      header: 'Estado',
      render: (plan) => (plan.active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>),
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'end',
      render: (plan) => (
        <span className="cluster">
          <button
            type="button"
            className="button button--ghost button--sm"
            aria-label={`Editar plan ${plan.name}`}
            disabled={!canEdit}
            onClick={() => setEditing({ mode: 'edit', plan })}
          >
            <Pencil size={14} aria-hidden="true" />
            Editar
          </button>
          <button
            type="button"
            className="button button--ghost button--sm"
            aria-label={`${plan.active ? 'Desactivar' : 'Activar'} plan ${plan.name}`}
            onClick={() => {
              setActionError(null);
              setToggling(plan);
            }}
          >
            <Power size={14} aria-hidden="true" />
            {plan.active ? 'Desactivar' : 'Activar'}
          </button>
          <button
            type="button"
            className="button button--danger-outline button--sm"
            aria-label={`Eliminar plan ${plan.name}`}
            onClick={() => setToDelete(plan)}
          >
            <Trash2 size={14} aria-hidden="true" />
            Eliminar
          </button>
        </span>
      ),
    },
  ];

  const createButton = (label: string) => (
    <button
      type="button"
      className="button button--primary"
      disabled={!canEdit}
      onClick={() => setEditing({ mode: 'create' })}
    >
      <Plus size={18} aria-hidden="true" />
      {label}
    </button>
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow={`EPS · ${eps.code}`}
        title={eps.name}
        back={back}
        description={
          <>
            {eps.active ? <Badge tone="success">Activa</Badge> : <Badge>Inactiva</Badge>}{' '}
            {eps.active
              ? 'Sus planes activos se ofrecen para afiliaciones nuevas.'
              : 'La EPS está inactiva: ninguno de sus planes se ofrece para afiliaciones nuevas.'}
          </>
        }
        actions={createButton('Nuevo plan')}
      />

      {regimes.state.status === 'error' ? (
        <ErrorState
          compact
          title="No pudimos cargar los regímenes"
          error={regimes.state.error}
          onRetry={() => regimes.reload()}
        />
      ) : null}

      <section aria-label="Planes" className="stack">
        {plans.length === 0 ? (
          <EmptyState
            icon={<ListTree size={36} />}
            title="Esta EPS aún no tiene planes"
            description="Crea un plan indicando su régimen."
            action={createButton('Crear plan')}
          />
        ) : (
          <DataTable
            caption={`Planes de ${eps.name}`}
            columns={columns}
            rows={[...plans].sort((a, b) => a.name.localeCompare(b.name, 'es'))}
            rowKey={(plan) => plan.id}
          />
        )}
      </section>

      <EpsPlanFormModal
        open={editing.mode !== 'closed'}
        epsId={eps.id}
        plan={editing.mode === 'edit' ? editing.plan : null}
        regimes={regimeList}
        onClose={() => setEditing({ mode: 'closed' })}
        onSaved={(saved, created) => {
          replace(saved);
          setEditing({ mode: 'closed' });
          toast.show({ title: created ? 'Plan creado' : 'Plan actualizado', description: saved.name });
        }}
      />

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.active === true ? '¿Desactivar este plan?' : '¿Activar este plan?'}
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
              ? `${toggling.name} dejará de ofrecerse para afiliaciones nuevas. Las afiliaciones existentes se conservan.`
              : `${toggling.name} volverá a ofrecerse para afiliaciones nuevas.`}
          </p>
        ) : null}
      </ConfirmDialog>

      {toDelete !== null ? (
        <DeleteReferencedDialog
          title="¿Eliminar este plan?"
          referencedCode={ERROR_CODES.planReferenced}
          referencedTitle="Tiene afiliaciones: desactívalo en lugar de borrarlo."
          active={toDelete.active}
          remove={() => deleteEpsPlan(toDelete.id)}
          onClose={() => setToDelete(null)}
          onDeleted={() => {
            const removed = toDelete;
            data.update((current) => ({
              ...current,
              plans: current.plans.filter((plan) => plan.id !== removed.id),
            }));
            setToDelete(null);
            toast.show({ title: 'Plan eliminado', description: removed.name });
          }}
          onDeactivate={async () => {
            const error = await changeStatus(toDelete, false);
            if (error === null) setToDelete(null);
            return error;
          }}
        >
          <p>
            Se eliminará el plan <strong>{toDelete.name}</strong> de forma permanente. Solo es posible si
            ninguna afiliación lo usa.
          </p>
        </DeleteReferencedDialog>
      ) : null}
    </div>
  );
}
