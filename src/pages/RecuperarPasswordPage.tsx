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

const NEUTRAL_MESSAGE = 'Si el correo corresponde a una cuenta, enviamos las instrucciones.';

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
  /**
   * Token de laboratorio: solo llega con `PASSWORD_RESET_EXPOSE_TOKEN=true` (D27) y para un correo
   * existente. Se muestra marcado como dato de laboratorio y nunca se guarda ni se registra.
   */
  const [devToken, setDevToken] = useState<string | null>(null);
  /** `message` del 202; si no llegara, se usa el texto neutro propio. */
  const [message, setMessage] = useState<string | null>(null);

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
      // 202 `{ message, devToken? }`: el mensaje es el mismo exista o no el correo (HU-006 CA-02).
      const response = await requestPasswordRecovery({ email: values.email.trim() });
      setStatus('success');
      setMessage(typeof response?.message === 'string' && response.message !== '' ? response.message : null);
      setDevToken(typeof response?.devToken === 'string' && response.devToken !== '' ? response.devToken : null);
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
        <FormAlert tone="success" title={message ?? NEUTRAL_MESSAGE}>
          <p>Revisa tu bandeja de entrada. El enlace caduca y solo puede usarse una vez.</p>
          {devToken !== null ? (
            <div className="alert__dev-token stack stack--sm">
              <p>
                <span className="badge badge--warning">Dato de laboratorio</span>{' '}
                Sin correo real, el servidor de laboratorio devuelve el token. Nunca ocurre en
                producción.
              </p>
              <p>
                Token: <code>{devToken}</code>
              </p>
              <Link className="link" to={`/restablecer-password?token=${encodeURIComponent(devToken)}`}>
                Restablecer la contraseña con este token
              </Link>
            </div>
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
