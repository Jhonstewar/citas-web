import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ToastContext, type ToastApi, type ToastInput, type ToastTone } from './toastContext';

interface ToastItem extends ToastInput {
  id: number;
  tone: ToastTone;
}

const DURATION_MS = 6000;

const ICON: Record<ToastTone, ReactNode> = {
  success: <CircleCheck size={20} aria-hidden="true" />,
  error: <CircleAlert size={20} aria-hidden="true" />,
  info: <Info size={20} aria-hidden="true" />,
};

const PREFIX: Record<ToastTone, string> = { success: 'Listo', error: 'Error', info: 'Aviso' };

/**
 * Región de avisos flotantes. Vive siempre en el DOM con `aria-live` para que los lectores de
 * pantalla anuncien cada aviso nuevo; los errores se anuncian con prioridad.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const show = useCallback(
    (input: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { ...input, id, tone: input.tone ?? 'success' }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Notificaciones">
        <div aria-live="polite" className="toasts__list">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast toast--${toast.tone}`} role="status">
              <span className="toast__icon">{ICON[toast.tone]}</span>
              <div className="toast__text">
                <p className="toast__title">
                  <span className="visually-hidden">{PREFIX[toast.tone]}: </span>
                  {toast.title}
                </p>
                {toast.description !== undefined ? (
                  <p className="toast__description">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                className="icon-button icon-button--sm"
                onClick={() => dismiss(toast.id)}
                aria-label="Descartar aviso"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </ToastContext>
  );
}
