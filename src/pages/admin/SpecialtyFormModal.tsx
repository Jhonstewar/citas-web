import { Info, Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toApiError, type ApiError } from '../../api/ApiError';
import { createSpecialty, updateSpecialty } from '../../api/adminApi';
import {
  ERROR_CODES,
  type AppointmentType,
  type DurationMinutes,
  type Specialty,
} from '../../api/contracts';
import { SegmentedControl } from '../../components/ChoiceControls';
import { FormAlert } from '../../components/FormAlert';
import { Modal } from '../../components/Modal';
import { TextField } from '../../components/TextField';

type Field = 'code' | 'name' | 'appointmentType' | 'durationMinutes';

const TYPE_OPTIONS = [
  { value: 'GENERAL', label: 'General' },
  { value: 'SPECIALIZED', label: 'Especializada' },
] as const;

const DURATION_OPTIONS = [
  { value: '30', label: '30 min' },
  { value: '60', label: '60 min' },
] as const;

export interface SpecialtyFormModalProps {
  open: boolean;
  /** Especialidad a editar; `null` para crear. */
  specialty: Specialty | null;
  onClose: () => void;
  onSaved: (specialty: Specialty, created: boolean) => void;
}

/**
 * Alta y edición de especialidad (HU-011). La duración solo admite 30 o 60 min (control
 * segmentado); el tipo determina si requiere aprobación (CA-03). El código es inmutable y
 * Medicina General (`protected`) no cambia de tipo.
 */
export function SpecialtyFormModal(props: SpecialtyFormModalProps) {
  if (!props.open) return null;
  return <SpecialtyForm {...props} />;
}

function SpecialtyForm({ specialty, onClose, onSaved }: SpecialtyFormModalProps) {
  const isNew = specialty === null;
  const [code, setCode] = useState('');
  const [name, setName] = useState(specialty?.name ?? '');
  const [type, setType] = useState<AppointmentType>(specialty?.appointmentType ?? 'SPECIALIZED');
  const [duration, setDuration] = useState<'30' | '60'>(specialty?.durationMinutes === 60 ? '60' : '30');
  const [errors, setErrors] = useState<Partial<Record<Field, string | undefined>>>({});
  const [failure, setFailure] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const typeLocked = specialty?.protected === true;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const local: Partial<Record<Field, string | undefined>> = {};
    if (isNew && code.trim() === '') local.code = 'Escribe un código, p. ej. CARDIOLOGIA.';
    if (name.trim() === '') local.name = 'Escribe el nombre de la especialidad.';
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    const durationMinutes = Number(duration) as DurationMinutes;
    setSaving(true);
    setFailure(null);
    try {
      const saved = isNew
        ? await createSpecialty({ code: code.trim(), name: name.trim(), appointmentType: type, durationMinutes })
        : await updateSpecialty(specialty.id, { name: name.trim(), appointmentType: type, durationMinutes });
      onSaved(saved, isNew);
    } catch (cause) {
      const error = toApiError(cause);
      setFailure(error);
      const next: Partial<Record<Field, string | undefined>> = {};
      for (const field of ['code', 'name', 'appointmentType', 'durationMinutes'] as const) {
        const message = error.fieldErrors[field];
        if (message !== undefined) next[field] = message;
      }
      if (error.code === ERROR_CODES.duplicate) next.code = error.message;
      setErrors(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      title={isNew ? 'Nueva especialidad' : 'Editar especialidad'}
      onClose={onClose}
      dismissible={!saving}
    >
      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {failure !== null ? <FormAlert tone="error" title={failure.message} /> : null}
        {isNew ? (
          <TextField
            label="Código"
            required
            maxLength={40}
            hint="Identificador estable en mayúsculas; no se puede cambiar después."
            value={code}
            error={errors.code}
            disabled={saving}
            onChange={(event) => {
              setCode(event.target.value.toUpperCase().replace(/\s+/g, '_'));
              setErrors((previous) => ({ ...previous, code: undefined }));
            }}
          />
        ) : (
          <p className="text-sm muted">
            Código: <strong>{specialty.code}</strong> (no se edita)
          </p>
        )}
        <TextField
          label="Nombre"
          required
          maxLength={120}
          value={name}
          error={errors.name}
          disabled={saving}
          onChange={(event) => {
            setName(event.target.value);
            setErrors((previous) => ({ ...previous, name: undefined }));
          }}
        />
        <SegmentedControl
          legend="Tipo de cita"
          name="tipo"
          options={TYPE_OPTIONS}
          value={type}
          onChange={setType}
          disabled={saving || typeLocked}
          error={errors.appointmentType}
          hint={
            typeLocked
              ? 'Medicina General está protegida: siempre es de tipo general.'
              : type === 'GENERAL'
                ? 'General: la cita se confirma al instante.'
                : 'Especializada: la cita requiere aprobación de un administrador.'
          }
        />
        <SegmentedControl
          legend="Duración de la cita"
          name="duracion"
          options={DURATION_OPTIONS}
          value={duration}
          onChange={setDuration}
          disabled={saving}
          error={errors.durationMinutes}
          hint="30 min ocupa una franja; 60 min, dos franjas consecutivas del mismo bloque."
        />
        {typeLocked ? (
          <p className="note">
            <Lock size={18} aria-hidden="true" />
            <span>Esta especialidad está protegida: no se puede desactivar ni cambiar de tipo.</span>
          </p>
        ) : (
          <p className="note">
            <Info size={18} aria-hidden="true" />
            <span>La duración aplica a las citas nuevas; el profesional no puede cambiarla.</span>
          </p>
        )}
        <div className="form-actions">
          <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button type="submit" className="button button--primary" disabled={saving} aria-busy={saving}>
            {saving ? <span className="button__spinner" aria-hidden="true" /> : null}
            {isNew ? 'Crear especialidad' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
