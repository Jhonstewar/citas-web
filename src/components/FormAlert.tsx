import type { ReactNode } from 'react';

export type AlertTone = 'error' | 'success' | 'info';

export interface FormAlertProps {
  tone: AlertTone;
  title: string;
  children?: ReactNode;
}

const ROLE_BY_TONE: Record<AlertTone, 'alert' | 'status'> = {
  error: 'alert',
  success: 'status',
  info: 'status',
};

const PREFIX_BY_TONE: Record<AlertTone, string> = {
  error: 'Error',
  success: 'Listo',
  info: 'Información',
};

/**
 * Aviso de resultado de formulario.
 *
 * El tono se comunica también con texto (`Error:`, `Listo:`) y con el rol ARIA,
 * no solo con color: el estado no puede depender únicamente del color.
 */
export function FormAlert({ tone, title, children }: FormAlertProps) {
  return (
    <div className={`alert alert--${tone}`} role={ROLE_BY_TONE[tone]}>
      <p className="alert__title">
        <span className="alert__prefix">{PREFIX_BY_TONE[tone]}:</span> {title}
      </p>
      {children !== undefined ? <div className="alert__body">{children}</div> : null}
    </div>
  );
}
