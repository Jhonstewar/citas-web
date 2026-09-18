import { FileQuestion } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '../components/EmptyState';

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

/** Ruta desconocida dentro de una sección del rol: se queda en el marco de la aplicación. */
export function InAppNotFoundPage() {
  return (
    <div className="page">
      <h1 className="visually-hidden">Página no encontrada</h1>
      <EmptyState
        icon={<FileQuestion size={36} />}
        title="Página no encontrada"
        description="La dirección que abriste no existe en la aplicación."
        action={
          <Link className="button button--primary button--link" to="/">
            Ir al inicio
          </Link>
        }
      />
    </div>
  );
}
