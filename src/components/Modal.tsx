import { X } from 'lucide-react';
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

export interface ModalProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** Elemento que recibe el foco al abrir; por defecto, el primer control. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Bloquea el cierre (Escape, fondo, botón) mientras hay una petición en vuelo. */
  dismissible?: boolean;
  /** `alertdialog` para confirmaciones destructivas. */
  role?: 'dialog' | 'alertdialog';
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusableIn(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute('hidden'),
  );
}

/**
 * Diálogo modal accesible: `aria-modal`, título asociado, foco atrapado con Tab/Shift+Tab,
 * Escape para cerrar y devolución del foco al elemento que lo abrió.
 */
export function Modal({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
  initialFocusRef,
  dismissible = true,
  role = 'dialog',
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const dismissibleRef = useRef(dismissible);

  useEffect(() => {
    onCloseRef.current = onClose;
    dismissibleRef.current = dismissible;
  });

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    if (panel !== null) {
      // Primero el contenido: empezar en el botón "Cerrar" obligaría a tabular para rellenar.
      const body = panel.querySelector<HTMLElement>('.modal__body');
      const target =
        initialFocusRef?.current ??
        (body !== null ? focusableIn(body)[0] : undefined) ??
        focusableIn(panel)[0] ??
        panel;
      target.focus();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus?.();
    };
    // Solo al abrir/cerrar: re-enfocar en cada render robaría el foco al escribir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (dismissibleRef.current) onCloseRef.current();
      return;
    }
    if (event.key !== 'Tab' || panelRef.current === null) return;
    const items = focusableIn(panelRef.current);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }

  return createPortal(
    <div
      className="modal"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={`modal__panel modal__panel--${size}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        {...(description !== undefined ? { 'aria-describedby': descriptionId } : {})}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <header className="modal__header">
          <div>
            <h2 className="modal__title" id={titleId}>
              {title}
            </h2>
            {description !== undefined ? (
              <div className="modal__description" id={descriptionId}>
                {description}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            disabled={!dismissible}
            aria-label="Cerrar"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </header>
        {children !== undefined ? <div className="modal__body">{children}</div> : null}
        {footer !== undefined ? <footer className="modal__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
