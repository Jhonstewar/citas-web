import { createContext, useContext } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastInput {
  tone?: ToastTone;
  title: string;
  description?: string;
}

export interface ToastApi {
  show: (toast: ToastInput) => void;
}

export const ToastContext = createContext<ToastApi | null>(null);

/** Confirmaciones breves y no bloqueantes ("Solicitud aprobada"). */
export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (value === null) throw new Error('useToast debe usarse dentro de <ToastProvider>.');
  return value;
}
