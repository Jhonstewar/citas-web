import { useRef, type ReactNode } from 'react';
import { FormAlert } from './FormAlert';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** `danger` para acciones destructivas o irreversibles. */
  tone?: 'primary' | 'danger';
  busy?: boolean;
  /** Error del servidor al confirmar; el diálogo queda abierto para decidir. */
  error?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmación explícita antes de una acción con efectos (aprobar, eliminar, desactivar).
 * El foco inicial va a "Cancelar": un Enter accidental no ejecuta la acción.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'primary',
  busy = false,
  error = null,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      role="alertdialog"
      dismissible={!busy}
      initialFocusRef={cancelRef}
      footer={
        <>
          <button
            ref={cancelRef}
            type="button"
            className="button button--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button button--${tone}`}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? <span className="button__spinner" aria-hidden="true" /> : null}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="stack">
        {children}
        {error !== null ? <FormAlert tone="error" title={error} /> : null}
      </div>
    </Modal>
  );
}
