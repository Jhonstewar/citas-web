import { CloudOff, FileQuestion, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { ApiError } from '../api/ApiError';

export interface ErrorStateProps {
  error: ApiError | null;
  title?: string | undefined;
  /** Mensaje si no hay `ApiError` que mostrar. */
  fallbackMessage?: string;
  onRetry?: (() => void) | undefined;
  compact?: boolean;
}

/**
 * Error al cargar una sección, explicado según su causa:
 * - 403: aviso de permiso insuficiente; la sesión sigue abierta (HU-005 CA-09).
 * - 404: el recurso no existe o no es tuyo (el backend no distingue a propósito).
 * - red / 5xx: reintento.
 * El 401 no llega aquí como pantalla: el cliente HTTP ya cerró la sesión y se vuelve al login.
 */
export function ErrorState({
  error,
  title,
  fallbackMessage = 'Ocurrió un problema inesperado.',
  onRetry,
  compact = false,
}: ErrorStateProps) {
  const kind = error?.kind ?? 'unknown';

  if (kind === 'forbidden') {
    return (
      <div className={compact ? 'error-state error-state--compact' : 'error-state'} role="alert">
        <span className="error-state__icon error-state__icon--warning" aria-hidden="true">
          <ShieldAlert size={28} />
        </span>
        <p className="error-state__title">Permiso insuficiente</p>
        <p className="error-state__message">
          {error?.message ?? 'Tu cuenta no tiene permisos para realizar esta acción.'} Tu sesión
          sigue abierta.
        </p>
      </div>
    );
  }

  const Icon = kind === 'network' ? CloudOff : kind === 'not_found' ? FileQuestion : TriangleAlert;

  return (
    <div className={compact ? 'error-state error-state--compact' : 'error-state'} role="alert">
      <span className="error-state__icon" aria-hidden="true">
        <Icon size={28} />
      </span>
      <p className="error-state__title">{title ?? 'No pudimos cargar esta información'}</p>
      <p className="error-state__message">{error?.message ?? fallbackMessage}</p>
      {onRetry !== undefined && kind !== 'not_found' ? (
        <button type="button" className="button button--ghost" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" />
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
