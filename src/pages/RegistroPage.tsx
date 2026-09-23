import { useCallback, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { register } from '../api/authApi';
import { ApiError, DEFAULT_MESSAGE_BY_KIND, toApiError } from '../api/ApiError';
import { getInsurancePlans } from '../api/catalogApi';
import { DOCUMENT_TYPES, ERROR_CODES, type InsurancePlan } from '../api/contracts';
import { useResource } from '../lib/useResource';
import { AuthLayout } from '../components/AuthLayout';
import { FormAlert } from '../components/FormAlert';
import { SelectField } from '../components/SelectField';
import { SubmitButton } from '../components/SubmitButton';
import { TextField } from '../components/TextField';
import {
  EMPTY_REGISTER_FORM,
  MAX_DOCUMENT_NUMBER,
  MAX_EMAIL,
  MAX_NAMES,
  MAX_PHONE,
  hasErrors,
  isDocumentTypeCode,
  validateRegisterForm,
  type FieldErrorMap,
  type RegisterField,
  type RegisterFormValues,
} from '../validation/authValidation';

type Status = 'idle' | 'loading' | 'success' | 'error';

const DOCUMENT_TYPE_OPTIONS = DOCUMENT_TYPES.map((type) => ({
  value: type.code,
  label: `${type.label} (${type.code})`,
}));

/** Campos del formulario que el servidor puede señalar en un 400. */
const SERVER_FIELDS: readonly RegisterField[] = [
  'firstNames',
  'lastNames',
  'documentType',
  'documentNumber',
  'email',
  'phone',
  'password',
  'insurancePlanId',
];

/** Texto de la opción vacía: la afiliación es opcional y el registro debe poder seguir sin ella. */
const NO_PLAN_OPTION = 'Sin afiliación / La agrego después';

const PLAN_HINT = 'Opcional. Si no la conoces ahora, puedes agregarla más adelante.';
const PLAN_LOADING_HINT = 'Cargando los planes de afiliación…';
/** El catálogo no cargó: el campo se degrada, pero el registro sigue siendo posible sin plan. */
const PLAN_UNAVAILABLE_HINT =
  'No pudimos cargar los planes de afiliación. Puedes crear tu cuenta sin afiliación y agregarla después.';
/** Solo se usa si el 422 llega sin un `detail` propio del servidor. */
const PLAN_REJECTED_FALLBACK =
  'Ese plan ya no está disponible. Elige otro o continúa sin afiliación.';

/**
 * Etiqueta con la EPS, el plan y el régimen: dos planes distintos pueden llamarse igual en EPS
 * diferentes, así que el nombre del plan por sí solo no los distingue.
 */
function planLabel(plan: InsurancePlan): string {
  return `${plan.eps.name} · ${plan.name} · ${plan.regime.name}`;
}

/**
 * Mensaje del 422 `INSURANCE_PLAN_UNAVAILABLE`. Manda el servidor: solo se recurre al texto
 * propio si no envió ninguno y el cliente HTTP puso su mensaje genérico de validación.
 */
function planRejectedMessage(error: ApiError): string {
  const byField = error.fieldErrors.insurancePlanId;
  if (typeof byField === 'string' && byField !== '') return byField;
  return error.message === DEFAULT_MESSAGE_BY_KIND.validation
    ? PLAN_REJECTED_FALLBACK
    : error.message;
}

/** RF-01 · Registro de usuario (rol USER). */
export function RegistroPage() {
  const navigate = useNavigate();

  const [values, setValues] = useState<RegisterFormValues>(EMPTY_REGISTER_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<RegisterField>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [failure, setFailure] = useState<ApiError | null>(null);

  // Catálogo PÚBLICO: se pide sin token porque quien se registra aún no tiene sesión.
  const plansLoader = useCallback((signal: AbortSignal) => getInsurancePlans(signal), []);
  const plans = useResource<InsurancePlan[]>(plansLoader, []);
  const plansState = plans.state;
  // Si el catálogo falla, el campo se degrada pero NUNCA bloquea el registro: es opcional.
  const planOptions =
    plansState.status === 'ready'
      ? plansState.data.map((plan) => ({ value: String(plan.id), label: planLabel(plan) }))
      : [];
  const planHint =
    plansState.status === 'loading'
      ? PLAN_LOADING_HINT
      : plansState.status === 'error'
        ? PLAN_UNAVAILABLE_HINT
        : PLAN_HINT;

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isBlocked = isLoading || isSuccess;
  const isPlanDisabled = isBlocked || plansState.status !== 'ready';

  function update(field: RegisterField, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBlocked) return;

    const errors = validateRegisterForm(values);
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      setStatus('idle');
      setFailure(null);
      return;
    }

    const documentType = values.documentType;
    if (!isDocumentTypeCode(documentType)) {
      setFieldErrors({ documentType: 'El tipo de documento seleccionado no es válido.' });
      return;
    }

    // La afiliación es opcional: si no se eligió plan, la clave NO viaja (ni `null` ni '').
    const chosenPlanId = Number(values.insurancePlanId);
    const insurancePlan =
      values.insurancePlanId !== '' && Number.isInteger(chosenPlanId)
        ? { insurancePlanId: chosenPlanId }
        : {};

    setStatus('loading');
    setFailure(null);

    try {
      // `passwordConfirm` no se envía: es una comprobación de cliente.
      await register({
        firstNames: values.firstNames.trim(),
        lastNames: values.lastNames.trim(),
        documentType,
        documentNumber: values.documentNumber.trim(),
        email: values.email.trim(),
        phone: values.phone.trim(),
        password: values.password,
        ...insurancePlan,
      });
      setStatus('success');
      // HU-001 no incluye auto-login: se envía al login, que confirma el alta con un aviso.
      void navigate('/login', { replace: true, state: { registeredEmail: values.email.trim() } });
    } catch (cause) {
      const error = toApiError(cause);
      setStatus('error');
      setFailure(error);
      if (error.kind === 'validation') {
        const next: FieldErrorMap<RegisterField> = {};
        for (const field of SERVER_FIELDS) {
          const message = error.fieldErrors[field];
          if (typeof message === 'string') next[field] = message;
        }
        // 422 INSURANCE_PLAN_UNAVAILABLE: el plan dejó de estar disponible entre la carga del
        // catálogo y el envío. Se señala el campo y se conserva todo lo ya escrito.
        if (error.code === ERROR_CODES.insurancePlanUnavailable) {
          next.insurancePlanId = planRejectedMessage(error);
        }
        setFieldErrors(next);
      }
    }
  }

  return (
    <AuthLayout
      width="wide"
      title="Crea tu cuenta"
      subtitle="Regístrate para solicitar y consultar tus citas. Los campos marcados con * son obligatorios."
      footer={
        <span>
          ¿Ya tienes cuenta? <Link className="link" to="/login">Inicia sesión</Link>
        </span>
      }
    >
      {failure !== null ? <RegistroFailure error={failure} /> : null}
      {isSuccess ? (
        <FormAlert tone="success" title="Cuenta creada. Ahora inicia sesión…" />
      ) : null}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <div className="form__grid">
          <TextField
            label="Nombres"
            name="firstNames"
            autoComplete="given-name"
            maxLength={MAX_NAMES}
            required
            value={values.firstNames}
            error={fieldErrors.firstNames}
            disabled={isBlocked}
            onChange={(event) => update('firstNames', event.target.value)}
          />
          <TextField
            label="Apellidos"
            name="lastNames"
            autoComplete="family-name"
            maxLength={MAX_NAMES}
            required
            value={values.lastNames}
            error={fieldErrors.lastNames}
            disabled={isBlocked}
            onChange={(event) => update('lastNames', event.target.value)}
          />
          <SelectField
            label="Tipo de documento"
            name="documentType"
            options={DOCUMENT_TYPE_OPTIONS}
            placeholder="Selecciona…"
            required
            value={values.documentType}
            error={fieldErrors.documentType}
            disabled={isBlocked}
            onChange={(event) => update('documentType', event.target.value)}
          />
          <TextField
            label="Número de documento"
            name="documentNumber"
            inputMode="numeric"
            maxLength={MAX_DOCUMENT_NUMBER}
            required
            value={values.documentNumber}
            error={fieldErrors.documentNumber}
            disabled={isBlocked}
            onChange={(event) => update('documentNumber', event.target.value)}
          />
          <TextField
            label="Correo electrónico"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            maxLength={MAX_EMAIL}
            required
            hint="Lo usarás para iniciar sesión."
            value={values.email}
            error={fieldErrors.email}
            disabled={isBlocked}
            onChange={(event) => update('email', event.target.value)}
          />
          <TextField
            label="Teléfono"
            type="tel"
            name="phone"
            autoComplete="tel"
            inputMode="tel"
            maxLength={MAX_PHONE}
            required
            value={values.phone}
            error={fieldErrors.phone}
            disabled={isBlocked}
            onChange={(event) => update('phone', event.target.value)}
          />
          <TextField
            label="Contraseña"
            type="password"
            name="password"
            autoComplete="new-password"
            required
            hint="Mínimo 8 caracteres, con al menos una letra y un número."
            value={values.password}
            error={fieldErrors.password}
            disabled={isBlocked}
            onChange={(event) => update('password', event.target.value)}
          />
          <TextField
            label="Confirmar contraseña"
            type="password"
            name="passwordConfirm"
            autoComplete="new-password"
            required
            value={values.passwordConfirm}
            error={fieldErrors.passwordConfirm}
            disabled={isBlocked}
            onChange={(event) => update('passwordConfirm', event.target.value)}
          />
        </div>
        <SelectField
          label="Plan de afiliación"
          name="insurancePlanId"
          options={planOptions}
          placeholder={NO_PLAN_OPTION}
          hint={planHint}
          value={values.insurancePlanId}
          error={fieldErrors.insurancePlanId}
          disabled={isPlanDisabled}
          onChange={(event) => update('insurancePlanId', event.target.value)}
        />
        <SubmitButton loading={isLoading} disabled={isSuccess} loadingLabel="Creando cuenta…">
          Crear cuenta
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}

/**
 * 409 es el caso interesante del registro: email o documento ya registrados
 * (restricciones únicas del backend, RF-01). No es lo mismo que un 400.
 */
function RegistroFailure({ error }: { error: ApiError }) {
  // El 422 del plan ya se explica con el mensaje del servidor junto al campo: aquí solo se
  // señala dónde mirar, sin repetir la misma frase dos veces.
  if (error.code === ERROR_CODES.insurancePlanUnavailable) {
    return (
      <FormAlert tone="error" title="No pudimos crear la cuenta con ese plan de afiliación.">
        <p>Revisa el campo «Plan de afiliación»: elige otro o continúa sin afiliación.</p>
      </FormAlert>
    );
  }
  if (error.kind === 'conflict') {
    return (
      <FormAlert tone="error" title={error.message}>
        <p>
          El correo o el número de documento ya están registrados. Puedes{' '}
          <Link className="link" to="/login">iniciar sesión</Link> o{' '}
          <Link className="link" to="/recuperar-password">recuperar tu contraseña</Link>.
        </p>
      </FormAlert>
    );
  }
  if (error.kind === 'validation') {
    return (
      <FormAlert tone="error" title={error.message}>
        <p>Corrige los campos señalados y vuelve a enviar el formulario.</p>
      </FormAlert>
    );
  }
  return <FormAlert tone="error" title={error.message} />;
}
