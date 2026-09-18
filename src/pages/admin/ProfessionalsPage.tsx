import { MapPin, Pencil, Power, Search, Star, Stethoscope, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { toApiError } from '../../api/ApiError';
import { listProfessionals, setProfessionalActive } from '../../api/adminApi';
import type { Professional } from '../../api/contracts';
import { SegmentedControl } from '../../components/ChoiceControls';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DataTable, type Column } from '../../components/DataTable';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { Badge } from '../../components/StatusBadge';
import { useToast } from '../../components/toastContext';
import { useResource } from '../../lib/useResource';

type ActiveFilter = 'all' | 'active' | 'inactive';

const ACTIVE_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
] as const;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('es')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/**
 * Profesionales (HU-013..016): listado con búsqueda y filtro activo/inactivo (el filtro lo aplica
 * el backend; la búsqueda por texto es local sobre lo ya cargado), alta y activación.
 */
export function ProfessionalsPage() {
  const toast = useToast();
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>('all');
  const [query, setQuery] = useState('');
  const professionals = useResource(
    (signal) =>
      listProfessionals(
        { active: activeFilter === 'all' ? undefined : activeFilter === 'active' },
        signal,
      ),
    [activeFilter],
  );
  const [toggling, setToggling] = useState<Professional | null>(null);
  const [busy, setBusy] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);

  async function confirmToggle() {
    if (toggling === null) return;
    setBusy(true);
    setToggleError(null);
    try {
      const saved = await setProfessionalActive(toggling.id, !toggling.active);
      professionals.update((list) => list.map((item) => (item.id === saved.id ? saved : item)));
      toast.show({ title: saved.active ? 'Profesional activado' : 'Profesional desactivado', description: saved.fullName });
      setToggling(null);
    } catch (cause) {
      setToggleError(toApiError(cause).message);
    } finally {
      setBusy(false);
    }
  }

  const columns: Column<Professional>[] = [
    {
      key: 'name',
      header: 'Profesional',
      primary: true,
      render: (item) => (
        <span className="person">
          <span className="avatar" aria-hidden="true">
            {initials(item.fullName)}
          </span>
          <span className="person__text">
            <span className="person__name">{item.fullName}</span>
            <span className="person__meta">{item.email}</span>
          </span>
        </span>
      ),
    },
    { key: 'document', header: 'Documento', render: (item) => `${item.documentType} ${item.documentNumber}` },
    {
      key: 'code',
      header: 'Código / matrícula',
      render: (item) => (
        <span className="person__text">
          <span>{item.professionalCode}</span>
          <span className="person__meta">{item.licenseNumber}</span>
        </span>
      ),
    },
    {
      key: 'specialties',
      header: 'Especialidades',
      render: (item) => (
        <span className="cluster">
          {item.specialties.map((specialty) => (
            <Badge
              key={specialty.id}
              tone={specialty.primary ? 'info' : 'neutral'}
              icon={specialty.primary ? <Star size={12} aria-label="Principal" /> : undefined}
            >
              {specialty.name}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: 'sites',
      header: 'Sedes',
      render: (item) => (
        <span className="cluster">
          {item.sites.map((site) => (
            <Badge key={site.id} icon={<MapPin size={12} aria-hidden="true" />}>
              {site.code}
            </Badge>
          ))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Estado',
      render: (item) => (item.active ? <Badge tone="success">Activo</Badge> : <Badge>Inactivo</Badge>),
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'end',
      render: (item) => (
        <span className="cluster">
          <Link
            className="button button--ghost button--sm button--link"
            to={`/admin/profesionales/${item.id}`}
            aria-label={`Editar a ${item.fullName}`}
          >
            <Pencil size={14} aria-hidden="true" />
            Editar
          </Link>
          <button
            type="button"
            className={item.active ? 'button button--danger-outline button--sm' : 'button button--ghost button--sm'}
            aria-label={`${item.active ? 'Desactivar' : 'Activar'} a ${item.fullName}`}
            onClick={() => {
              setToggleError(null);
              setToggling(item);
            }}
          >
            <Power size={14} aria-hidden="true" />
            {item.active ? 'Desactivar' : 'Activar'}
          </button>
        </span>
      ),
    },
  ];

  const needle = normalize(query.trim());
  const rows =
    professionals.state.status === 'ready'
      ? professionals.state.data.filter((item) =>
          needle === ''
            ? true
            : normalize(
                [item.fullName, item.email, item.documentNumber, item.professionalCode, item.licenseNumber].join(' '),
              ).includes(needle),
        )
      : [];

  return (
    <div className="page">
      <PageHeader
        eyebrow="Administración"
        title="Profesionales"
        description="Crea profesionales, asígnales especialidades y sedes, y actívalos o desactívalos."
        actions={
          <Link className="button button--primary button--link" to="/admin/profesionales/nuevo">
            <UserPlus size={18} aria-hidden="true" />
            Nuevo profesional
          </Link>
        }
      />

      <section className="filters" aria-label="Filtros">
        <div className="field search">
          <label className="field__label" htmlFor="buscar-profesional">
            Buscar
          </label>
          <Search size={18} className="search__icon" aria-hidden="true" />
          <input
            id="buscar-profesional"
            type="search"
            className="field__input"
            placeholder="Nombre, documento, correo o código"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <SegmentedControl
          legend="Estado"
          name="estado-profesional"
          options={ACTIVE_OPTIONS}
          value={activeFilter}
          onChange={setActiveFilter}
        />
      </section>

      <section aria-label="Listado de profesionales" aria-busy={professionals.state.status === 'loading'}>
        {professionals.state.status === 'loading' ? <LoadingSection variant="row" count={4} /> : null}
        {professionals.state.status === 'error' ? (
          <ErrorState error={professionals.state.error} onRetry={() => professionals.reload()} />
        ) : null}
        {professionals.state.status === 'ready' && rows.length === 0 ? (
          <EmptyState
            icon={<Stethoscope size={36} />}
            title={
              professionals.state.data.length === 0 && activeFilter === 'all'
                ? 'Aún no hay profesionales'
                : 'Ningún profesional coincide'
            }
            description={
              professionals.state.data.length === 0 && activeFilter === 'all'
                ? 'Crea el primero para que pueda publicar su agenda.'
                : 'Prueba con otra búsqueda o cambia el filtro de estado.'
            }
            action={
              <Link className="button button--primary button--link" to="/admin/profesionales/nuevo">
                Nuevo profesional
              </Link>
            }
          />
        ) : null}
        {rows.length > 0 ? (
          <DataTable caption="Profesionales" columns={columns} rows={rows} rowKey={(item) => item.id} />
        ) : null}
      </section>

      <ConfirmDialog
        open={toggling !== null}
        title={toggling?.active === true ? '¿Desactivar a este profesional?' : '¿Activar a este profesional?'}
        confirmLabel={toggling?.active === true ? 'Desactivar' : 'Activar'}
        tone={toggling?.active === true ? 'danger' : 'primary'}
        busy={busy}
        error={toggleError}
        onCancel={() => setToggling(null)}
        onConfirm={() => void confirmToggle()}
      >
        {toggling !== null ? (
          <p>
            {toggling.active
              ? `${toggling.fullName} dejará de ofrecerse en las búsquedas y no recibirá citas nuevas. Sus citas existentes se conservan y podrá seguir iniciando sesión.`
              : `${toggling.fullName} volverá a ofrecerse en las búsquedas.`}
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
