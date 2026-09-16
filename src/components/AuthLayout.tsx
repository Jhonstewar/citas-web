import type { ReactNode } from 'react';

export interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Enlaces secundarios al pie de la tarjeta (registro, login, recuperación). */
  footer?: ReactNode;
  /** `wide` usa dos columnas de campos en escritorio (formulario de registro). */
  width?: 'narrow' | 'wide';
}

/**
 * Marco compartido por las pantallas de autenticación: una sola tarjeta
 * centrada, con la identidad del laboratorio arriba y la acción principal
 * como único foco de la pantalla.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  width = 'narrow',
}: AuthLayoutProps) {
  return (
    <main className="auth">
      <div className={`auth__card auth__card--${width}`}>
        <header className="auth__header">
          <p className="auth__brand">
            <span className="auth__brand-mark" aria-hidden="true" />
            FCV Citas
          </p>
          <h1 className="auth__title">{title}</h1>
          <p className="auth__subtitle">{subtitle}</p>
        </header>
        {children}
        {footer !== undefined ? <footer className="auth__footer">{footer}</footer> : null}
      </div>
      <p className="auth__disclaimer">
        Entorno de laboratorio con datos ficticios. No registres información real de pacientes
        ni de profesionales.
      </p>
    </main>
  );
}
