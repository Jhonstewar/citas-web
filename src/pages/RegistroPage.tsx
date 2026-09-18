import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { register } from '../api/authApi';
import { ApiError, toApiError } from '../api/ApiError';
import { DOCUMENT_TYPES } from '../api/contracts';
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
];

/** RF-01 · Registro de usuario (rol USER). */
export function RegistroPage() {
  const navigate = useNavigate();

  const [values, setValues] = useState<RegisterFormValues>(EMPTY_REGISTER_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<RegisterField>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [failure, setFailure] = useState<ApiError | null>(null);

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';
  const isBlocked = isLoading || isSuccess;

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
