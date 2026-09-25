import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { login } from '../api/authApi';
import { ApiError, toApiError } from '../api/ApiError';
import { AuthLayout } from '../components/AuthLayout';
import { FormAlert } from '../components/FormAlert';
import { SubmitButton } from '../components/SubmitButton';
import { TextField } from '../components/TextField';
import { useSession } from '../auth/useSession';
import {
  EMPTY_LOGIN_FORM,
  hasErrors,
  validateLoginForm,
  type FieldErrorMap,
  type LoginField,
  type LoginFormValues,
} from '../validation/authValidation';

type Status = 'idle' | 'loading' | 'success' | 'error';

/**
 * RF-02 · Inicio de sesión por email + contraseña.
 *
 * Si ya hay sesión (p. ej. la cookie del refresh token la restauró al recargar /login, D36), no
 * tiene sentido pedir credenciales: se redirige al inicio del rol (`/` → `RoleHomeRedirect`) o a
 * la ruta de retorno que dejó `RequireAuth`.
 */
export function LoginPage() {
  const { signIn, status: sessionStatus } = useSession();
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState<LoginFormValues>(EMPTY_LOGIN_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<LoginField>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [failure, setFailure] = useState<ApiError | null>(null);

  const isLoading = status === 'loading';
  const isSuccess = status === 'success';

  // Ruta a la que el usuario intentaba entrar antes de ser redirigido a /login.
  const state = location.state as { from?: string; registeredEmail?: string } | null;
  const redirectTo = state?.from ?? '/';
  const registeredEmail = state?.registeredEmail;

  // Sesión ya abierta al llegar, o restaurada mientras se mostraba el formulario. El éxito del
  // propio formulario ya navega desde `handleSubmit`; aquí se cubre el resto de casos.
  if (sessionStatus === 'authenticated' && status !== 'success') {
    return <Navigate to={redirectTo} replace />;
  }

  function update(field: LoginField, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }));
    // El error del campo se limpia al escribir: mantenerlo sería ruido.
    setFieldErrors((previous) => {
      const next = { ...previous };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading || isSuccess) return;

    const errors = validateLoginForm(values);
    setFieldErrors(errors);
    if (hasErrors(errors)) {
      setStatus('idle');
      setFailure(null);
      return;
    }

    setStatus('loading');
    setFailure(null);

    try {
      const tokens = await login({
        email: values.email.trim(),
        password: values.password,
      });
      signIn(tokens);
      setStatus('success');
      void navigate(redirectTo, { replace: true });
    } catch (cause) {
      const error = toApiError(cause);
      setStatus('error');
      setFailure(error);
      // 400: el servidor puede señalar campos concretos.
      if (error.kind === 'validation') {
        const next: FieldErrorMap<LoginField> = {};
        if (typeof error.fieldErrors.email === 'string') next.email = error.fieldErrors.email;
        if (typeof error.fieldErrors.password === 'string') {
          next.password = error.fieldErrors.password;
        }
        setFieldErrors(next);
      }
    }
  }

  return (
    <AuthLayout
      title="Inicia sesión"
      subtitle="Accede con el correo con el que creaste tu cuenta."
      footer={
        <>
          <Link className="link" to="/recuperar-password">
            Olvidé mi contraseña
          </Link>
          <span className="auth__footer-separator" aria-hidden="true">
            ·
          </span>
          <span>
            ¿No tienes cuenta? <Link className="link" to="/registro">Regístrate</Link>
          </span>
        </>
      }
    >
      {registeredEmail !== undefined && failure === null && !isSuccess ? (
        <FormAlert tone="success" title="Tu cuenta fue creada. Inicia sesión para continuar." />
      ) : null}
      {failure !== null ? <LoginFailure error={failure} /> : null}
      {isSuccess ? <FormAlert tone="success" title="Sesión iniciada. Entrando…" /> : null}

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
          disabled={isLoading || isSuccess}
          onChange={(event) => update('email', event.target.value)}
        />
        <TextField
          label="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={values.password}
          error={fieldErrors.password}
          disabled={isLoading || isSuccess}
          onChange={(event) => update('password', event.target.value)}
        />
        <SubmitButton loading={isLoading} disabled={isSuccess} loadingLabel="Verificando…">
          Entrar
        </SubmitButton>
      </form>
    </AuthLayout>
  );
}

/**
 * Traduce el fallo a un mensaje útil según el código de estado.
 * Un 401 en login no es "sesión expirada": son credenciales incorrectas.
 */
function LoginFailure({ error }: { error: ApiError }) {
  if (error.kind === 'session') {
    return (
      <FormAlert tone="error" title="Correo o contraseña incorrectos.">
        <p>Verifica los datos. Si no recuerdas tu contraseña puedes recuperarla desde el enlace inferior.</p>
      </FormAlert>
    );
  }
  if (error.kind === 'forbidden') {
    return (
      <FormAlert tone="error" title="Tu cuenta no puede iniciar sesión.">
        <p>Es posible que esté desactivada. Contacta al administrador del laboratorio.</p>
      </FormAlert>
    );
  }
  return <FormAlert tone="error" title={error.message} />;
}
