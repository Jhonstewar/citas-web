import { Link } from 'react-router';

/** Ruta desconocida. */
export function NotFoundPage() {
  return (
    <main className="auth">
      <div className="auth__card auth__card--narrow">
        <header className="auth__header">
          <p className="auth__brand">
            <span className="auth__brand-mark" aria-hidden="true" />
            FCV Citas
          </p>
          <h1 className="auth__title">Página no encontrada</h1>
          <p className="auth__subtitle">La dirección que abriste no existe en la aplicación.</p>
        </header>
        <Link className="button button--primary button--link" to="/">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
