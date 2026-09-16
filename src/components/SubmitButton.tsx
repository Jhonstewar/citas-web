import type { ReactNode } from 'react';

export interface SubmitButtonProps {
  children: ReactNode;
  /** Petición en vuelo: el botón se bloquea para no duplicar peticiones. */
  loading: boolean;
  /** Bloqueo por otra causa (por ejemplo, operación ya completada). */
  disabled?: boolean;
  loadingLabel?: string;
}

/**
 * Botón de envío con estado visible.
 *
 * Mientras `loading` es true el botón queda `disabled`: sin esto, un doble
 * clic genera dos POST de registro o de login.
 */
export function SubmitButton({
  children,
  loading,
  disabled = false,
  loadingLabel = 'Enviando…',
}: SubmitButtonProps) {
  const isDisabled = loading || disabled;
  return (
    <button
      type="submit"
      className="button button--primary"
      disabled={isDisabled}
      aria-busy={loading}
    >
      {loading ? (
        <>
          <span className="button__spinner" aria-hidden="true" />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
