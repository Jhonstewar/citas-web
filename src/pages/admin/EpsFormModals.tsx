import { useState, type FormEvent } from 'react';
import { toApiError, type ApiError } from '../../api/ApiError';
import { createEps, createEpsPlan, updateEps, updateEpsPlan } from '../../api/adminApi';
import { ERROR_CODES, type CatalogItem, type Eps, type EpsPlan } from '../../api/contracts';
import { FormAlert } from '../../components/FormAlert';
import { Modal } from '../../components/Modal';
import { SelectField } from '../../components/SelectField';
import { SubmitButton } from '../../components/SubmitButton';
import { TextField } from '../../components/TextField';

type FieldErrors<F extends string> = Partial<Record<F, string | undefined>>;

/**
 * Reparte el error del servidor en los campos del formulario: los `fieldErrors` de un 400 y el
 * `field` de un 409 `DUPLICATE`. Devuelve también si quedó algún mensaje sin campo, para
 * mostrarlo arriba del formulario en vez de duplicarlo.
 */
function serverErrors<F extends string>(
  error: ApiError,
  fields: readonly F[],
): { errors: FieldErrors<F>; unassigned: boolean } {
  const errors: FieldErrors<F> = {};
  for (const field of fields) {
    const message = error.fieldErrors[field];
    if (message !== undefined) errors[field] = message;
  }
  const duplicateField = fields.find((field) => field === error.field);
  if (error.code === ERROR_CODES.duplicate && duplicateField !== undefined) {
    errors[duplicateField] = error.message;
  }
  return { errors, unassigned: Object.keys(errors).length === 0 };
}

/** Código estable: mayúsculas y sin espacios, como el de las especialidades. */
function normalizeCode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, '_');
}

/* -------------------------------------------------------------------------- */
/* EPS                                                                        */
/* -------------------------------------------------------------------------- */

type EpsField = 'code' | 'name';

export interface EpsFormModalProps {
  open: boolean;
  /** EPS a editar; `null` para crear. */
  eps: Eps | null;
  onClose: () => void;
  onSaved: (eps: Eps, created: boolean) => void;
}

/** Alta y edición de EPS (HU-012). El contrato solo admite editar el nombre: el código es inmutable. */
export function EpsFormModal(props: EpsFormModalProps) {
  if (!props.open) return null;
  return <EpsForm {...props} />;
}

function EpsForm({ eps, onClose, onSaved }: EpsFormModalProps) {
  const isNew = eps === null;
  const [code, setCode] = useState('');
  const [name, setName] = useState(eps?.name ?? '');
  const [errors, setErrors] = useState<FieldErrors<EpsField>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const local: FieldErrors<EpsField> = {};
    if (isNew && code.trim() === '') local.code = 'Escribe un código, p. ej. EPS_DEMO.';
    if (name.trim() === '') local.name = 'Escribe el nombre de la EPS.';
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    setSaving(true);
    setFailure(null);
    try {
      const saved = isNew
        ? await createEps({ code: code.trim(), name: name.trim() })
        : await updateEps(eps.id, { name: name.trim() });
      onSaved(saved, isNew);
    } catch (cause) {
      const error = toApiError(cause);
      const mapped = serverErrors(error, ['code', 'name'] as const);
      setErrors(mapped.errors);
      setFailure(mapped.unassigned ? error.message : null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={isNew ? 'Nueva EPS' : 'Editar EPS'} onClose={onClose} dismissible={!saving}>
      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {failure !== null ? <FormAlert tone="error" title={failure} /> : null}
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
              setCode(normalizeCode(event.target.value));
              setErrors((previous) => ({ ...previous, code: undefined }));
            }}
          />
        ) : (
          <p className="text-sm muted">
            Código: <strong>{eps.code}</strong> (no se edita)
          </p>
        )}
        <TextField
          label="Nombre"
          required
          maxLength={120}
          hint="Usa nombres de demostración: los datos del laboratorio son sintéticos."
          value={name}
          error={errors.name}
          disabled={saving}
          onChange={(event) => {
            setName(event.target.value);
            setErrors((previous) => ({ ...previous, name: undefined }));
          }}
        />
        <div className="form-actions">
          <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <SubmitButton loading={saving} keepLabel>
            {isNew ? 'Crear EPS' : 'Guardar cambios'}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}

/* -------------------------------------------------------------------------- */
/* Plan de EPS                                                                */
/* -------------------------------------------------------------------------- */

type PlanField = 'code' | 'name' | 'regimeCode';

export interface EpsPlanFormModalProps {
  open: boolean;
  epsId: number;
  /** Plan a editar; `null` para crear. */
  plan: EpsPlan | null;
  /** Catálogo fijo de regímenes (RF-05), de `/api/catalogs/regimes`. */
  regimes: readonly CatalogItem[];
  onClose: () => void;
  onSaved: (plan: EpsPlan, created: boolean) => void;
}

/**
 * Alta y edición de un plan (HU-012). El código es inmutable tras crear; nombre y régimen se
 * editan. El régimen sale del catálogo: el servidor rechaza uno inexistente (CA-02).
 */
export function EpsPlanFormModal(props: EpsPlanFormModalProps) {
  if (!props.open) return null;
  return <EpsPlanForm {...props} />;
}

function EpsPlanForm({ epsId, plan, regimes, onClose, onSaved }: EpsPlanFormModalProps) {
  const isNew = plan === null;
  const [code, setCode] = useState('');
  const [name, setName] = useState(plan?.name ?? '');
  const [regimeCode, setRegimeCode] = useState(plan?.regime.code ?? '');
  const [errors, setErrors] = useState<FieldErrors<PlanField>>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const local: FieldErrors<PlanField> = {};
    if (isNew && code.trim() === '') local.code = 'Escribe un código, p. ej. PLAN_BASICO.';
    if (name.trim() === '') local.name = 'Escribe el nombre del plan.';
    if (regimeCode === '') local.regimeCode = 'Elige el régimen del plan.';
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    setSaving(true);
    setFailure(null);
    try {
      const saved = isNew
        ? await createEpsPlan(epsId, { code: code.trim(), name: name.trim(), regimeCode })
        : await updateEpsPlan(plan.id, { name: name.trim(), regimeCode });
      onSaved(saved, isNew);
    } catch (cause) {
      const error = toApiError(cause);
      const mapped = serverErrors(error, ['code', 'name', 'regimeCode'] as const);
      setErrors(mapped.errors);
      setFailure(mapped.unassigned ? error.message : null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={isNew ? 'Nuevo plan' : 'Editar plan'} onClose={onClose} dismissible={!saving}>
      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {failure !== null ? <FormAlert tone="error" title={failure} /> : null}
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
              setCode(normalizeCode(event.target.value));
              setErrors((previous) => ({ ...previous, code: undefined }));
            }}
          />
        ) : (
          <p className="text-sm muted">
            Código: <strong>{plan.code}</strong> (no se edita)
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
        <SelectField
          label="Régimen"
          required
          placeholder="Elige un régimen"
          options={regimes.map((regime) => ({ value: regime.code, label: regime.name }))}
          value={regimeCode}
          error={errors.regimeCode}
          disabled={saving}
          onChange={(event) => {
            setRegimeCode(event.target.value);
            setErrors((previous) => ({ ...previous, regimeCode: undefined }));
          }}
        />
        <div className="form-actions">
          <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <SubmitButton loading={saving} keepLabel>
            {isNew ? 'Crear plan' : 'Guardar cambios'}
          </SubmitButton>
        </div>
      </form>
    </Modal>
  );
}
