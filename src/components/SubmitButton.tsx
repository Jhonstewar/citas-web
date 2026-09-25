import type { ReactNode } from 'react';

export type SubmitButtonTone = 'primary' | 'danger';
export type SubmitButtonSize = 'sm' | 'md' | 'lg';

export interface SubmitButtonProps {
  children: ReactNode;
  /** Petición en vuelo: el botón se bloquea para no duplicar peticiones. */
  loading: boolean;
  /** Bloqueo por otra causa (por ejemplo, operación ya completada o campo vacío). */
  disabled?: boolean;
  /** Texto durante la carga. Se ignora si `keepLabel` es true. */
  loadingLabel?: string;
  /**
   * Conserva el texto del botón durante la carga (spinner + texto) en vez de sustituirlo por
   * `loadingLabel`. Es el patrón de los formularios de administración y de los modales.
   */
  keepLabel?: boolean;
  /** `danger` para acciones destructivas (rechazar, eliminar). Por defecto `primary`. */
  tone?: SubmitButtonTone;
  size?: SubmitButtonSize;
  /** Ocupa todo el ancho del contenedor. */
  block?: boolean;
  /** Id del `<form>` que envía, para botones que viven fuera de él (p. ej. pie de un modal). */
  form?: string | undefined;
  className?: string | undefined;
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
  keepLabel = false,
  tone = 'primary',
  size = 'md',
  block = false,
  form,
  className,
}: SubmitButtonProps) {
  const isDisabled = loading || disabled;
  const classes = [
    'button',
    `button--${tone}`,
    size !== 'md' ? `button--${size}` : null,
    block ? 'button--block' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="submit" className={classes} disabled={isDisabled} aria-busy={loading} form={form}>
      {loading ? (
        <>
          <span className="button__spinner" aria-hidden="true" />
          {keepLabel ? children : loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
