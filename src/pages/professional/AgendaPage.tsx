import {
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Lock,
  MapPin,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { toApiError } from '../../api/ApiError';
import type { Block, IsoDate } from '../../api/contracts';
import { deleteBlock, getMyProfile, listBlocks } from '../../api/professionalApi';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { useToast } from '../../components/toastContext';
import {
  addDays,
  daysBetween,
  formatDayNumber,
  formatLongDate,
  formatRange,
  formatWeekday,
  startOfWeek,
  todayIso,
} from '../../lib/dates';
import { useResource } from '../../lib/useResource';
import { BlockFormModal } from './BlockFormModal';

type Editing = { mode: 'closed' } | { mode: 'create' } | { mode: 'edit'; block: Block };

/**
 * Mi agenda (HU-017..019): semana de lunes a domingo con los bloques propios y sus franjas
 * libres u ocupadas; crear, editar y eliminar bloques futuros sin reservas.
 */
export function AgendaPage() {
  const toast = useToast();
  const today = todayIso();
  const [weekStart, setWeekStart] = useState<IsoDate>(() => startOfWeek(todayIso()));
  const weekEnd = addDays(weekStart, 6);

  const profile = useResource((signal) => getMyProfile(signal), []);
  const blocks = useResource((signal) => listBlocks(weekStart, weekEnd, signal), [weekStart, weekEnd]);

  const [editing, setEditing] = useState<Editing>({ mode: 'closed' });
  const [toDelete, setToDelete] = useState<Block | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const sites = profile.state.status === 'ready' ? profile.state.data.sites : [];
  const canCreate = profile.state.status === 'ready';

  function handleSaved(block: Block, created: boolean) {
    setEditing({ mode: 'closed' });
    toast.show({
      title: created ? 'Bloque creado' : 'Bloque actualizado',
      description: `${formatLongDate(block.date)}, ${block.startTime} – ${block.endTime}`,
    });
    const target = startOfWeek(block.date);
    if (target !== weekStart) setWeekStart(target);
    else blocks.reload({ silent: true });
  }

  async function confirmDelete() {
    if (toDelete === null) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteBlock(toDelete.id);
      const removed = toDelete;
      blocks.update((current) => current.filter((block) => block.id !== removed.id));
      setToDelete(null);
      toast.show({ title: 'Bloque eliminado' });
    } catch (cause) {
      setDeleteError(toApiError(cause).message);
    } finally {
      setDeleting(false);
    }
  }

  const days = daysBetween(weekStart, weekEnd);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Profesional"
        title="Mi agenda"
        description="Publica bloques de disponibilidad; se dividen en franjas de 30 minutos."
        actions={
          <button
            type="button"
            className="button button--primary"
            disabled={!canCreate}
            onClick={() => setEditing({ mode: 'create' })}
          >
            <CalendarPlus size={18} aria-hidden="true" />
            Nuevo bloque
          </button>
        }
      />

      {profile.state.status === 'error' ? (
        <ErrorState compact error={profile.state.error} onRetry={() => profile.reload()} />
      ) : null}

      <div className="week-nav">
        <div className="cluster">
          <button
            type="button"
            className="button button--ghost button--sm"
            onClick={() => setWeekStart(addDays(weekStart, -7))}
          >
            <ChevronLeft size={16} aria-hidden="true" />
            Semana anterior
          </button>
          <button
            type="button"
            className="button button--ghost button--sm"
            onClick={() => setWeekStart(startOfWeek(todayIso()))}
          >
            Hoy
          </button>
          <button
            type="button"
            className="button button--ghost button--sm"
            onClick={() => setWeekStart(addDays(weekStart, 7))}
          >
            Semana siguiente
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
        <h2 className="week-nav__range" aria-live="polite">
          {formatRange(weekStart, weekEnd)}
        </h2>
      </div>

      <div className="legend" aria-label="Leyenda">
        <span className="legend__item">
          <span className="legend__swatch slot--free" aria-hidden="true" /> Libre
        </span>
        <span className="legend__item">
          <span className="legend__swatch slot--taken" aria-hidden="true" /> Ocupada (reservada o
          retenida)
        </span>
      </div>

      <section aria-label="Semana" aria-busy={blocks.state.status === 'loading'}>
        {blocks.state.status === 'loading' ? <LoadingSection label="Cargando tu agenda…" count={3} /> : null}
        {blocks.state.status === 'error' ? (
          <ErrorState error={blocks.state.error} onRetry={() => blocks.reload()} />
        ) : null}
        {blocks.state.status === 'ready' && blocks.state.data.length === 0 ? (
          <EmptyState
            icon={<CalendarRange size={36} />}
            title="No tienes bloques esta semana"
            description="Crea un bloque para que los pacientes puedan reservar contigo."
            action={
              <button
                type="button"
                className="button button--primary"
                disabled={!canCreate}
                onClick={() => setEditing({ mode: 'create' })}
              >
                Crear bloque
              </button>
            }
          />
        ) : null}
        {blocks.state.status === 'ready' && blocks.state.data.length > 0 ? (
          <div className="week">
            {days.map((day) => {
              const ofDay = (blocks.state.status === 'ready' ? blocks.state.data : [])
                .filter((block) => block.date === day)
                .sort((a, b) => a.startTime.localeCompare(b.startTime));
              const headingId = `dia-${day}`;
              return (
                <section
                  key={day}
                  className={day === today ? 'day day--today' : 'day'}
                  aria-labelledby={headingId}
                >
                  <h3 className="day__title" id={headingId}>
                    <span>{formatWeekday(day)}</span>
                    <span>{formatDayNumber(day)}</span>
                    {day === today ? <span className="badge badge--info">Hoy</span> : null}
                    <span className="visually-hidden">{formatLongDate(day)}</span>
                  </h3>
                  {ofDay.length === 0 ? <p className="day__empty">Sin bloques</p> : null}
                  {ofDay.map((block) => (
                    <BlockCard
                      key={block.id}
                      block={block}
                      onEdit={() => setEditing({ mode: 'edit', block })}
                      onDelete={() => {
                        setDeleteError(null);
                        setToDelete(block);
                      }}
                    />
                  ))}
                </section>
              );
            })}
          </div>
        ) : null}
      </section>

      <BlockFormModal
        open={editing.mode !== 'closed'}
        block={editing.mode === 'edit' ? editing.block : null}
        sites={sites}
        defaultDate={weekStart > today ? weekStart : today}
        onClose={() => setEditing({ mode: 'closed' })}
        onSaved={handleSaved}
      />

      <ConfirmDialog
        open={toDelete !== null}
        title="¿Eliminar este bloque?"
        confirmLabel="Eliminar bloque"
        tone="danger"
        busy={deleting}
        error={deleteError}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void confirmDelete()}
      >
        {toDelete !== null ? (
          <p>
            Se eliminará el bloque del {formatLongDate(toDelete.date)} de {toDelete.startTime} a{' '}
            {toDelete.endTime} en {toDelete.site.name}. Sus franjas dejarán de ofrecerse.
          </p>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}

function BlockCard({
  block,
  onEdit,
  onDelete,
}: {
  block: Block;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const free = block.slots.filter((slot) => slot.available).length;
  const label = `${block.startTime} a ${block.endTime} del ${formatLongDate(block.date)}`;
  return (
    <article className={block.editable ? 'block' : 'block block--locked'} aria-label={`Bloque ${label}`}>
      <div className="block__head">
        <span className="block__time">
          {block.startTime} – {block.endTime}
        </span>
        {block.editable ? (
          <span className="block__actions">
            <button
              type="button"
              className="icon-button icon-button--sm"
              aria-label={`Editar bloque de ${label}`}
              onClick={onEdit}
            >
              <Pencil size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button icon-button--sm"
              aria-label={`Eliminar bloque de ${label}`}
              onClick={onDelete}
            >
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </span>
        ) : (
          <Lock size={16} aria-hidden="true" className="muted" />
        )}
      </div>
      <span className="badge badge--neutral" style={{ width: 'fit-content' }}>
        <MapPin size={12} aria-hidden="true" />
        {block.site.name}
      </span>
      <p className="text-xs muted">
        {free} de {block.slots.length} franjas libres
      </p>
      <ul className="slots" aria-label="Franjas">
        {block.slots.map((slot) => (
          <li key={slot.id} className={slot.available ? 'slot slot--free' : 'slot slot--taken'}>
            <span>{slot.startTime}</span>
            <span className="slot__state">{slot.available ? 'Libre' : 'Ocupada'}</span>
          </li>
        ))}
      </ul>
      {!block.editable ? (
        <p className="block__lock">
          No editable: el bloque ya pasó o tiene citas reservadas.
        </p>
      ) : null}
    </article>
  );
}
