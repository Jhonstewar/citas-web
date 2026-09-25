import { BadgeCheck, CalendarDays, IdCard, Lock, Mail, ShieldPlus, UserRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DEFAULT_MESSAGE_BY_KIND, toApiError, type ApiError } from '../../api/ApiError';
import { getInsurancePlans } from '../../api/catalogApi';
import { DOCUMENT_TYPES, ERROR_CODES, type InsurancePlan, type UserResponse } from '../../api/contracts';
import { removeAffiliation, setAffiliation, updateProfile } from '../../api/userApi';
import { useCurrentUser } from '../../auth/CurrentUserContext';
import { Card } from '../../components/Card';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { DetailItem, DetailList } from '../../components/DetailList';
import { EmptyState } from '../../components/EmptyState';
import { FormAlert } from '../../components/FormAlert';
import { PageHeader } from '../../components/PageHeader';
import { SelectField } from '../../components/SelectField';
import { SubmitButton } from '../../components/SubmitButton';
import { TextField } from '../../components/TextField';
import { useToast } from '../../components/toastContext';
import { formatLongDate } from '../../lib/dates';
import { planLabel } from '../../lib/insurancePlans';
import { useResource } from '../../lib/useResource';
import {
  MAX_NAMES,
  MAX_PHONE,
  hasErrors,
  validateProfileForm,
  type FieldErrorMap,
  type ProfileField,
  type ProfileFormValues,
} from '../../validation/authValidation';

/** Nombre legible de los campos que el servidor puede señalar con `FIELD_NOT_EDITABLE`. */
const FIELD_LABEL: Readonly<Record<string, string>> = {
  email: 'correo electrónico',
  documentType: 'tipo de documento',
  documentNumber: 'número de documento',
  password: 'contraseña', // secret-scan:allow etiqueta visible del campo, no una credencial
  roles: 'roles',
};

const PROFILE_FIELDS: readonly ProfileField[] = ['firstNames', 'lastNames', 'phone'];

function valuesOf(user: UserResponse): ProfileFormValues {
  return { firstNames: user.firstNames, lastNames: user.lastNames, phone: user.phone ?? '' };
}

/**
 * Perfil del paciente (HU-008) y su afiliación (HU-009, segundo corte). Los campos editables son
 * los que declara el servidor (D25): nombres, apellidos y teléfono. Correo y documento se
 * muestran en consulta. La afiliación vigente es una sola (D26): cambiarla cierra la anterior y
 * quitarla la cierra sin reemplazo; ambas cosas las hace el backend.
 */
export function ProfilePage() {
  const { user } = useCurrentUser();
  return (
    <div className="page">
      <PageHeader
        eyebrow="Paciente"
        title="Mi perfil"
        description="Consulta y actualiza tus datos de contacto y tu afiliación a EPS."
      />
      <div className="grid grid--2">
        <PersonalDataCard user={user} />
        <AffiliationCard user={user} />
      </div>
    </div>
  );
}

function PersonalDataCard({ user }: { user: UserResponse }) {
  const { replaceUser } = useCurrentUser();
  const toast = useToast();
  const [values, setValues] = useState<ProfileFormValues>(() => valuesOf(user));
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<ProfileField>>({});
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const stored = valuesOf(user);
  const dirty = PROFILE_FIELDS.some((field) => values[field].trim() !== stored[field]);
  const documentType = DOCUMENT_TYPES.find((type) => type.code === user.documentType);

  function change(field: ProfileField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
    setSaved(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const errors = validateProfileForm(values);
    setFieldErrors(errors);
    setFailure(null);
    setSaved(false);
    if (hasErrors(errors)) return;

    setSaving(true);
    try {
      const updated = await updateProfile({
        firstNames: values.firstNames.trim(),
        lastNames: values.lastNames.trim(),
        phone: values.phone.trim(),
      });
      // El marco muestra el nombre: se sustituye el usuario de la sesión por la respuesta.
      replaceUser(updated);
      setValues(valuesOf(updated));
      setSaved(true);
      toast.show({ tone: 'success', title: 'Datos actualizados' });
    } catch (cause) {
      const error = toApiError(cause);
      if (error.code === ERROR_CODES.fieldNotEditable) {
        const label = error.field !== undefined ? (FIELD_LABEL[error.field] ?? error.field) : null;
        setFailure(label !== null ? `${error.message} (campo: ${label}).` : error.message);
      } else {
        const serverErrors: FieldErrorMap<ProfileField> = {};
        for (const field of PROFILE_FIELDS) {
          const message = error.fieldErrors[field];
          if (typeof message === 'string') serverErrors[field] = message;
        }
        setFieldErrors(serverErrors);
        // Con errores por campo, el aviso general solo acompaña; sin ellos, es el mensaje.
        setFailure(hasErrors(serverErrors) ? DEFAULT_MESSAGE_BY_KIND.validation : error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Datos personales" icon={<UserRound size={20} />}>
      <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
        {failure !== null ? <FormAlert tone="error" title={failure} /> : null}
        {saved ? <FormAlert tone="success" title="Tus datos quedaron guardados." /> : null}
        <TextField
          label="Nombres"
          name="firstNames"
          autoComplete="given-name"
          required
          maxLength={MAX_NAMES}
          value={values.firstNames}
          error={fieldErrors.firstNames}
          disabled={saving}
          onChange={(event) => change('firstNames', event.target.value)}
        />
        <TextField
          label="Apellidos"
          name="lastNames"
          autoComplete="family-name"
          required
          maxLength={MAX_NAMES}
          value={values.lastNames}
          error={fieldErrors.lastNames}
          disabled={saving}
          onChange={(event) => change('lastNames', event.target.value)}
        />
        <TextField
          label="Teléfono"
          name="phone"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          required
          maxLength={MAX_PHONE}
          value={values.phone}
          error={fieldErrors.phone}
          disabled={saving}
          onChange={(event) => change('phone', event.target.value)}
        />

        <DetailList aria-label="Datos que no se editan">
          <DetailItem icon={<Mail size={18} />} label="Correo electrónico">
            {user.email}
          </DetailItem>
          <DetailItem icon={<IdCard size={18} />} label="Documento">
            {documentType?.label ?? user.documentType} {user.documentNumber}
          </DetailItem>
        </DetailList>
        <p className="note">
          <Lock size={18} aria-hidden="true" />
          <span>
            El correo y el documento identifican tu cuenta y no se pueden cambiar desde aquí.
          </span>
        </p>

        <div className="form-actions">
          <SubmitButton loading={saving} disabled={!dirty} loadingLabel="Guardando…">
            Guardar cambios
          </SubmitButton>
        </div>
      </form>
    </Card>
  );
}

/** Mensaje del 422 `INSURANCE_PLAN_UNAVAILABLE`: manda el del servidor (campo o `detail`). */
function planRejectedMessage(error: ApiError): string {
  const byField = error.fieldErrors.insurancePlanId;
  if (typeof byField === 'string' && byField !== '') return byField;
  return error.message;
}

function AffiliationCard({ user }: { user: UserResponse }) {
  const { replaceUser } = useCurrentUser();
  const toast = useToast();
  const plans = useResource<InsurancePlan[]>((signal) => getInsurancePlans(signal), []);
  const [planId, setPlanId] = useState('');
  const [planError, setPlanError] = useState<string | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const current = user.affiliation ?? null;
  const options =
    plans.state.status === 'ready'
      ? plans.state.data.map((plan) => ({ value: String(plan.id), label: planLabel(plan) }))
      : [];
  const hint =
    plans.state.status === 'loading'
      ? 'Cargando los planes de afiliación…'
      : plans.state.status === 'error'
        ? `No pudimos cargar los planes: ${plans.state.error.message}`
        : undefined;
  const sameAsCurrent = current !== null && planId === String(current.plan.id);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setFailure(null);
    if (planId === '') {
      setPlanError('Selecciona un plan de afiliación.');
      return;
    }
    setSaving(true);
    setPlanError(undefined);
    try {
      const affiliation = await setAffiliation(Number(planId));
      replaceUser({ ...user, affiliation });
      setPlanId('');
      toast.show({ tone: 'success', title: 'Afiliación actualizada', description: planLabel(affiliation.plan) });
    } catch (cause) {
      const error = toApiError(cause);
      if (error.code === ERROR_CODES.insurancePlanUnavailable) {
        // El plan dejó de estar disponible entre la carga y el envío: se recarga la lista.
        setPlanError(planRejectedMessage(error));
        setPlanId('');
        plans.reload({ silent: true });
      } else if (typeof error.fieldErrors.insurancePlanId === 'string') {
        setPlanError(error.fieldErrors.insurancePlanId);
      } else {
        setFailure(error.message);
      }
    } finally {
      setSaving(false);
    }
  }

  async function confirmRemove() {
    if (removing) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      await removeAffiliation();
      replaceUser({ ...user, affiliation: null });
      setRemoveOpen(false);
      toast.show({ tone: 'success', title: 'Afiliación retirada' });
    } catch (cause) {
      setRemoveError(toApiError(cause).message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card title="Afiliación" icon={<ShieldPlus size={20} />}>
      <div className="stack">
        {current !== null ? (
          <DetailList aria-label="Afiliación vigente">
            <DetailItem icon={<BadgeCheck size={18} />} label="EPS">
              {current.plan.eps.name}
            </DetailItem>
            <DetailItem icon={<ShieldPlus size={18} />} label="Plan">
              {current.plan.name} · {current.plan.regime.name}
            </DetailItem>
            <DetailItem icon={<CalendarDays size={18} />} label="Vigente desde">
              {formatLongDate(current.startedOn)}
            </DetailItem>
          </DetailList>
        ) : (
          <EmptyState
            compact
            icon={<ShieldPlus size={32} />}
            title="Sin afiliación"
            description="Elige tu plan de EPS para registrarla. Es opcional."
          />
        )}

        <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
          {failure !== null ? <FormAlert tone="error" title={failure} /> : null}
          <SelectField
            label={current !== null ? 'Cambiar a otro plan' : 'Plan de afiliación'}
            name="insurancePlanId"
            placeholder="Selecciona un plan"
            options={options}
            hint={
              hint ??
              (current !== null
                ? 'Al cambiar de plan, la afiliación actual se cierra con la fecha de hoy.'
                : undefined)
            }
            value={planId}
            error={planError}
            disabled={saving || plans.state.status !== 'ready'}
            onChange={(event) => {
              setPlanId(event.target.value);
              setPlanError(undefined);
              setFailure(null);
            }}
          />
          <div className="form-actions">
            {current !== null ? (
              <button
                type="button"
                className="button button--danger-outline"
                onClick={() => {
                  setRemoveError(null);
                  setRemoveOpen(true);
                }}
                disabled={saving}
              >
                Quitar afiliación
              </button>
            ) : null}
            <SubmitButton loading={saving} disabled={planId === '' || sameAsCurrent} loadingLabel="Guardando…">
              {current !== null ? 'Cambiar plan' : 'Guardar afiliación'}
            </SubmitButton>
          </div>
          {sameAsCurrent ? <p className="field__hint">Ese plan ya es tu afiliación vigente.</p> : null}
        </form>
      </div>

      <ConfirmDialog
        open={removeOpen}
        title="¿Quitar tu afiliación?"
        confirmLabel="Sí, quitar afiliación"
        cancelLabel="No, conservarla"
        tone="danger"
        busy={removing}
        error={removeError}
        onConfirm={() => void confirmRemove()}
        onCancel={() => {
          if (!removing) setRemoveOpen(false);
        }}
      >
        {current !== null ? (
          <p>
            Dejarás de estar afiliado a <strong>{planLabel(current.plan)}</strong>. El registro se
            conserva como histórico y podrás volver a afiliarte cuando quieras.
          </p>
        ) : null}
      </ConfirmDialog>
    </Card>
  );
}
