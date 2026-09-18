import { useCallback, useEffect, useState } from 'react';
import { toApiError, type ApiError } from '../api/ApiError';

export type ResourceState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'error'; error: ApiError };

export interface Resource<T> {
  state: ResourceState<T>;
  /** Vuelve a pedir el recurso. `silent` conserva los datos visibles mientras llega la respuesta. */
  reload: (options?: { silent?: boolean }) => void;
  /** Ajusta localmente los datos ya cargados (p. ej. quitar una solicitud decidida). */
  update: (updater: (current: T) => T) => void;
}

/**
 * Carga un recurso con `loading / ready / error`, abortando la petición al desmontar o cuando
 * cambian las dependencias. Un 401 no recuperable ya cerró la sesión en el cliente HTTP, así que
 * aquí solo se muestran los demás fallos.
 */
export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): Resource<T> {
  const [state, setState] = useState<ResourceState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    loader(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', error: toApiError(cause) });
      });
    return () => controller.abort();
    // `loader` cambia en cada render; las dependencias reales las declara quien llama.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  const reload = useCallback((options: { silent?: boolean } = {}) => {
    if (options.silent !== true) setState({ status: 'loading' });
    setAttempt((previous) => previous + 1);
  }, []);

  const update = useCallback((updater: (current: T) => T) => {
    setState((previous) =>
      previous.status === 'ready' ? { status: 'ready', data: updater(previous.data) } : previous,
    );
  }, []);

  return { state, reload, update };
}
