import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { requestPasswordRecovery } from '../api/authApi';
import { ApiError, toApiError } from '../api/ApiError';
import { AuthLayout } from '../components/AuthLayout';
import { FormAlert } from '../components/FormAlert';
import { SubmitButton } from '../components/SubmitButton';
import { TextField } from '../components/TextField';
import {
  EMPTY_RECOVERY_FORM,
  hasErrors,
  validateRecoveryForm,
  type FieldErrorMap,
  type RecoveryField,
  type RecoveryFormValues,
} from '../validation/authValidation';

type Status = 'idle' | 'loading' | 'success' | 'error';

/**
 * RF-03 · Solicitud de recuperación de contraseña.
 *
 * El resultado se muestra siempre igual ("si el correo existe, te enviamos
 * instrucciones") para no revelar qué correos están registrados.
 */
export function RecuperarPasswordPage() {
  const [values, setValues] = useState<RecoveryFormValues>(EMPTY_RECOVERY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<RecoveryField>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [failure, setFailure] = useState<ApiError | null>(null);
  /** Token de desarrollo si el backend decide exponerlo (permitido por RF-03). */
  const [devToken, setDevToken] = useState<string | null>(null);

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    const errors = validateRecoveryForm(values);
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      setStatus('idle');
      setFailure(null);
      return;
    }

    setStatus('loading');
    setFailure(null);
    setDevToken(null);

    try {
      const response = await requestPasswordRecovery({ email: values.email.trim() });
      setStatus('success');
      setDevToken(response.devToken ?? null);
    } catch (cause) {
      const error = toApiError(cause);
      setStatus('error');
      setFailure(error);
      if (error.kind === 'validation' && typeof error.fieldErrors.email === 'string') {
        setFieldErrors({ email: error.fieldErrors.email });
      }
    }
  }

  return (
    <AuthLayout
      title="Recupera tu contraseña"
      subtitle="Te enviaremos un enlace temporal de un solo uso al correo de tu cuenta."
      footer={
        <span>
          <Link className="link" to="/login">Volver a iniciar sesión</Link>
        </span>
      }
    >
      {failure !== null ? <FormAlert tone="error" title={failure.message} /> : null}
      {isSuccess ? (
        <FormAlert
          tone="success"
          title="Si el correo corresponde a una cuenta, enviamos las instrucciones."
        >
          <p>Revisa tu bandeja de entrada. El enlace caduca y solo puede usarse una vez.</p>
          {devToken !== null ? (
            <p className="alert__dev-token">
              Token de desarrollo del laboratorio: <code>{devToken}</code>
            </p>
          ) : null}
        </FormAlert>
      ) : null}

      <form className="form" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Correo electrónico"
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={values.email}
          error={fieldErrors.email}
          disabled={isLoading}
          onChange={(event) => {
            setValues({ email: event.target.value });
            setFieldErrors({});
          }}
        />
        <SubmitButton loading={isLoading} loadingLabel="Enviando…">
          {isSuccess ? 'Enviar de nuevo' : 'Enviar instrucciones'}
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}
