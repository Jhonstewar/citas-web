import { useEffect, useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { resetPassword } from '../api/authApi';
import { DEFAULT_MESSAGE_BY_KIND, toApiError, type ApiError } from '../api/ApiError';
import { ERROR_CODES } from '../api/contracts';
import { AuthLayout } from '../components/AuthLayout';
import { FormAlert } from '../components/FormAlert';
import { SubmitButton } from '../components/SubmitButton';
import { TextField } from '../components/TextField';
import {
  EMPTY_RESET_PASSWORD_FORM,
  MAX_PASSWORD_BYTES,
  MIN_PASSWORD,
  hasErrors,
  validateResetPasswordForm,
  type FieldErrorMap,
  type ResetPasswordField,
  type ResetPasswordFormValues,
} from '../validation/authValidation';

type Status = 'idle' | 'loading' | 'success' | 'token-invalid' | 'error';

const POLICY_HINT = `Mínimo ${MIN_PASSWORD} caracteres, con al menos una letra y un número (hasta ${MAX_PASSWORD_BYTES} bytes).`;

/**
 * RF-03 · HU-007 · Paso 2 de la recuperación: nueva contraseña con el token de un solo uso que
 * llega en `/restablecer-password?token=…`. El token viaja en el cuerpo, nunca en la ruta de la
 * API. La política D29 se valida aquí como ayuda; el servidor decide y su `fieldErrors.newPassword`
 * se muestra en el campo. Tras el éxito el backend revoca todas las sesiones: se vuelve a entrar.
 *
 * Seguridad: al montar, el token se copia al estado del componente y se quita de la barra de
 * direcciones reemplazando la entrada actual del historial (`navigate(..., { replace: true })`,
 * que usa `history.replaceState` por debajo y mantiene sincronizado al router). Así no queda en
 * el historial del navegador ni a la vista al compartir pantalla o volver con "Atrás".
 */
export function RestablecerPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Se lee una sola vez: después de limpiar la URL, el estado es la única copia.
  const [token] = useState(() => params.get('token')?.trim() ?? '');
  const [values, setValues] = useState<ResetPasswordFormValues>(EMPTY_RESET_PASSWORD_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<ResetPasswordField>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [failure, setFailure] = useState<ApiError | null>(null);

  const isLoading = status === 'loading';

  // Quita `token` de la URL (conservando cualquier otro parámetro) sin añadir una entrada nueva.
  useEffect(() => {
    if (!params.has('token')) return;
    const remaining = new URLSearchParams(params);
    remaining.delete('token');
    const search = remaining.toString();
    void navigate(
      { pathname: location.pathname, search: search === '' ? '' : `?${search}`, hash: location.hash },
      { replace: true, state: location.state as unknown },
    );
  }, [params, navigate, location.pathname, location.hash, location.state]);

  function update(field: ResetPasswordField, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    const errors = validateResetPasswordForm(values);
    setFieldErrors(errors);
    setFailure(null);
    if (hasErrors(errors)) {
      setStatus('idle');
      return;
    }

    setStatus('loading');
    try {
      await resetPassword({ token, newPassword: values.newPassword });
      setValues(EMPTY_RESET_PASSWORD_FORM);
      setStatus('success');
    } catch (cause) {
      const error = toApiError(cause);
      setFailure(error);
      if (error.code === ERROR_CODES.resetTokenInvalid) {
        setStatus('token-invalid');
        return;
      }
      setStatus('error');
      const byField = error.fieldErrors.newPassword;
      if (typeof byField === 'string') setFieldErrors({ newPassword: byField });
    }
  }

  const requestAnother = (
    <Link className="button button--primary button--block button--link" to="/recuperar-password">
      Pedir otro enlace
    </Link>
  );

  return (
    <AuthLayout
      title="Crea una nueva contraseña"
      subtitle="El enlace es de un solo uso. Al cambiarla se cerrarán tus sesiones abiertas."
      footer={
        <span>
          <Link className="link" to="/login">Volver a iniciar sesión</Link>
        </span>
      }
    >
      {token === '' ? (
        <>
          <FormAlert tone="error" title="El enlace está incompleto: no trae el código de restablecimiento.">
            <p>Abre el enlace completo que recibiste o pide uno nuevo.</p>
          </FormAlert>
          {requestAnother}
        </>
      ) : status === 'success' ? (
        <>
          <FormAlert tone="success" title="Tu contraseña se cambió correctamente.">
            <p>Por seguridad cerramos las sesiones abiertas. Entra de nuevo con tu contraseña nueva.</p>
          </FormAlert>
          <Link className="button button--primary button--block button--link" to="/login">
            Iniciar sesión
          </Link>
        </>
      ) : status === 'token-invalid' ? (
        <>
          <FormAlert tone="error" title={failure?.message ?? 'El enlace no es válido o ha caducado.'}>
            <p>Los enlaces caducan y solo sirven una vez. Pide uno nuevo para continuar.</p>
          </FormAlert>
          {requestAnother}
        </>
      ) : (
        <>
          {status === 'error' && failure !== null ? (
            <FormAlert
              tone="error"
              title={hasErrors(fieldErrors) ? DEFAULT_MESSAGE_BY_KIND.validation : failure.message}
            />
          ) : null}
          <form className="form" onSubmit={(event) => void handleSubmit(event)} noValidate>
            <TextField
              label="Nueva contraseña"
              type="password"
              name="newPassword"
              autoComplete="new-password"
              required
              hint={POLICY_HINT}
              value={values.newPassword}
              error={fieldErrors.newPassword}
              disabled={isLoading}
              onChange={(event) => update('newPassword', event.target.value)}
            />
            <TextField
              label="Confirmar contraseña"
              type="password"
              name="passwordConfirm"
              autoComplete="new-password"
              required
              value={values.passwordConfirm}
              error={fieldErrors.passwordConfirm}
              disabled={isLoading}
              onChange={(event) => update('passwordConfirm', event.target.value)}
            />
            <SubmitButton loading={isLoading} loadingLabel="Guardando…" block>
              Cambiar contraseña
            </SubmitButton>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
