import { Info } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toApiError, type ApiError } from '../../api/ApiError';
import type { Block, BlockRequest, IsoDate, SiteRef } from '../../api/contracts';
import { createBlock, updateBlock } from '../../api/professionalApi';
import { FormAlert } from '../../components/FormAlert';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { SubmitButton } from '../../components/SubmitButton';
import { TextField } from '../../components/TextField';
import { halfHourGrid, todayIso, toMinutes } from '../../lib/dates';

const START_OPTIONS = halfHourGrid('00:00', '23:00').map((time) => ({ value: time, label: time }));
const END_OPTIONS = halfHourGrid('00:30', '23:30').map((time) => ({ value: time, label: time }));

type Field = 'date' | 'siteId' | 'startTime' | 'endTime';

export interface BlockFormModalProps {
  open: boolean;
  /** Bloque a editar; `null` para crear uno nuevo. */
  block: Block | null;
  sites: readonly SiteRef[];
  defaultDate: IsoDate;
  onClose: () => void;
  onSaved: (block: Block, created: boolean) => void;
}

/**
 * Crear o editar un bloque de disponibilidad (HU-017, HU-018). Horas en la rejilla de 30 min y
 * solo las sedes asignadas. El pasado, el solape y la sede no asignada los decide el backend:
 * sus 400/409/422 se muestran en el formulario.
 */
export function BlockFormModal(props: BlockFormModalProps) {
  // Montar el formulario solo con el modal abierto reinicia sus valores en cada apertura.
  if (!props.open) return null;
  return <BlockForm {...props} />;
}

function BlockForm({ block, sites, defaultDate, onClose, onSaved }: BlockFormModalProps) {
  const [date, setDate] = useState<IsoDate>(block?.date ?? defaultDate);
  const [siteId, setSiteId] = useState<string>(
    block !== null ? String(block.site.id) : sites.length === 1 ? String(sites[0]?.id) : '',
  );
  const [startTime, setStartTime] = useState(block?.startTime ?? '08:00');
  const [endTime, setEndTime] = useState(block?.endTime ?? '12:00');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const minutes = toMinutes(endTime) - toMinutes(startTime);
  const slotCount = minutes > 0 ? minutes / 30 : 0;

  function clear(field: Field) {
    setErrors((previous) => {
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    // Ayuda de cliente: evita un viaje inútil, pero la regla la aplica el backend.
    const local: Partial<Record<Field, string>> = {};
    if (date === '') local.date = 'Elige la fecha del bloque.';
    if (siteId === '') local.siteId = 'Elige la sede.';
    if (slotCount <= 0) local.endTime = 'La hora de fin debe ser posterior a la de inicio.';
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    const body: BlockRequest = { siteId: Number(siteId), date, startTime, endTime };
    setSaving(true);
    setFailure(null);
    try {
      const saved = block === null ? await createBlock(body) : await updateBlock(block.id, body);
      onSaved(saved, block === null);
    } catch (cause) {
      const error = toApiError(cause);
      setFailure(error);
      const next: Partial<Record<Field, string>> = {};
      for (const field of ['date', 'siteId', 'startTime', 'endTime'] as const) {
        const message = error.fieldErrors[field];
        if (message !== undefined) next[field] = message;
      }
      setErrors(next);
    } finally {
      setSaving(false);
    }
  }

  const title = block === null ? 'Nuevo bloque de disponibilidad' : 'Editar bloque';

  return (
    <Modal
      open
      title={title}
      description="Los pacientes verán sus franjas de 30 minutos en cuanto guardes."
      onClose={onClose}
      dismissible={!saving}
    >
      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {failure !== null ? (
          <FormAlert
            tone="error"
            title={failure.kind === 'forbidden' ? 'Permiso insuficiente' : 'No se pudo guardar el bloque'}
          >
            <p>{failure.message}</p>
          </FormAlert>
        ) : null}
        <div className="form__grid">
          <TextField
            label="Fecha"
            type="date"
            required
            min={todayIso()}
            value={date}
            error={errors.date}
            disabled={saving}
            onChange={(event) => {
              setDate(event.target.value);
              clear('date');
            }}
          />
          <SelectField
            label="Sede"
            required
            placeholder="Selecciona…"
            options={sites.map((site) => ({ value: String(site.id), label: site.name }))}
            value={siteId}
            error={errors.siteId}
            hint={sites.length === 0 ? 'No tienes sedes asignadas: pide al administrador que te asigne una.' : undefined}
            disabled={saving}
            onChange={(event) => {
              setSiteId(event.target.value);
              clear('siteId');
            }}
          />
          <SelectField
            label="Hora de inicio"
            required
            options={START_OPTIONS}
            value={startTime}
            error={errors.startTime}
            disabled={saving}
            onChange={(event) => {
              setStartTime(event.target.value);
              clear('startTime');
              clear('endTime');
            }}
          />
          <SelectField
            label="Hora de fin"
            required
            options={END_OPTIONS}
            value={endTime}
            error={errors.endTime}
            disabled={saving}
            onChange={(event) => {
              setEndTime(event.target.value);
              clear('endTime');
            }}
          />
        </div>
        <p className="note" aria-live="polite">
          <Info size={18} aria-hidden="true" />
          <span>
            {slotCount > 0
              ? `Se crearán ${slotCount} ${slotCount === 1 ? 'franja' : 'franjas'} de 30 minutos (${startTime} – ${endTime}).`
              : 'Elige una hora de fin posterior a la de inicio.'}
          </span>
        </p>
        <div className="form-actions">
          <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <SubmitButton loading={saving} keepLabel>
            Guardar bloque
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
