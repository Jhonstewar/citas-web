import { Power, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toApiError, type ApiError } from '../../api/ApiError';
import { FormAlert } from '../../components/FormAlert';
import { Modal } from '../../components/Modal';

export interface DeleteReferencedDialogProps {
  title: string;
  children: ReactNode;
  /** `code` del 409 que significa "está referenciado" (p. ej. `EPS_REFERENCED`). */
  referencedCode: string;
  /** Explicación breve cuando el borrado se rechaza por estar referenciado. */
  referencedTitle: string;
  /** Si el registro está activo se ofrece desactivarlo en su lugar. */
  active: boolean;
  remove: () => Promise<void>;
  onClose: () => void;
  onDeleted: () => void;
  onDeactivate: () => Promise<ApiError | null>;
}

/**
 * Borrado con confirmación de un catálogo (patrón de `DeleteSpecialtyDialog`, D28). Si el
 * servidor responde 409 con `referencedCode`, no se borra físicamente: se muestra su mensaje y
 * se ofrece desactivar el registro en su lugar.
 */
export function DeleteReferencedDialog({
  title,
  children,
  referencedCode,
  referencedTitle,
  active,
  remove,
  onClose,
  onDeleted,
  onDeactivate,
}: DeleteReferencedDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const referenced = error?.code === referencedCode;

  async function handleRemove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await remove();
      onDeleted();
    } catch (cause) {
      setError(toApiError(cause));
    } finally {
      setBusy(false);
    }
  }

  async function handleDeactivate() {
    if (busy) return;
    setBusy(true);
    const failure = await onDeactivate();
    setBusy(false);
    if (failure !== null) setError(failure);
  }

  return (
    <Modal
      open
      role="alertdialog"
      size="sm"
      title={title}
      onClose={onClose}
      dismissible={!busy}
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={onClose} disabled={busy}>
            Cancelar
          </button>
          {referenced && active ? (
            <button
              type="button"
              className="button button--primary"
              onClick={() => void handleDeactivate()}
              disabled={busy}
              aria-busy={busy}
            >
              <Power size={16} aria-hidden="true" />
              Desactivar en su lugar
            </button>
          ) : null}
          {referenced ? null : (
            <button
              type="button"
              className="button button--danger"
              onClick={() => void handleRemove()}
              disabled={busy}
              aria-busy={busy}
            >
              {busy ? <span className="button__spinner" aria-hidden="true" /> : <Trash2 size={16} aria-hidden="true" />}
              Eliminar
            </button>
          )}
        </>
      }
    >
      <div className="stack">
        {children}
        {referenced ? (
          <FormAlert tone="info" title={referencedTitle}>
            <p>{error?.message}</p>
            {active ? null : <p>Ya está inactivo: no se ofrece para afiliaciones nuevas.</p>}
          </FormAlert>
        ) : error !== null ? (
          <FormAlert tone="error" title={error.message} />
        ) : null}
      </div>
    </Modal>
  );
}
