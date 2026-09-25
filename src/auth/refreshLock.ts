import { ApiError, DEFAULT_MESSAGE_BY_KIND } from '../api/ApiError';

/**
 * Exclusión mutua de la renovación ENTRE PESTAÑAS (D36).
 *
 * `singleFlight` evita dos renovaciones a la vez dentro de una pestaña, pero la cookie
 * `fcv_refresh` la comparten todas las pestañas del navegador. Si dos pestañas renuevan a la vez
 * (p. ej. F5 en ambas, o dos access tokens que caducan juntos), las dos presentan la MISMA cookie:
 * la segunda llega con un token ya consumido, el servidor lo lee como reuso y revoca la familia
 * completa, y ambas pestañas acaban en el login.
 *
 * Se serializan con la Web Locks API: mientras una pestaña renueva, las demás esperan el candado.
 * No hace falta compartir el resultado: el navegador guarda la cookie rotada al recibir la
 * respuesta, así que la pestaña que entra después envía ya la cookie NUEVA y hace una rotación
 * legítima (no un reuso). Cada pestaña conserva su propio access token en memoria.
 *
 * Sin Web Locks (navegadores antiguos, jsdom en las pruebas) la operación corre sin candado: se
 * mantiene la garantía dentro de la pestaña y queda el riesgo residual entre pestañas.
 */

/** Nombre del candado; común a todas las pestañas del mismo origen. */
export const REFRESH_LOCK_NAME = 'fcv-refresh';

/**
 * Tope de espera por el candado. Si otra pestaña lo retiene más tiempo (una petición colgada),
 * esta renovación se da por "sin respuesta": no cierra una sesión abierta ni restaura una nueva.
 */
export const REFRESH_LOCK_TIMEOUT_MS = 15_000;

interface LockManagerLike {
  request: (
    name: string,
    options: { mode: 'exclusive'; signal?: AbortSignal },
    callback: () => Promise<unknown>,
  ) => Promise<unknown>;
}

function lockManager(): LockManagerLike | null {
  if (typeof navigator === 'undefined' || !('locks' in navigator)) return null;
  const locks = (navigator as { locks?: LockManagerLike }).locks;
  return locks !== undefined && typeof locks.request === 'function' ? locks : null;
}

export async function withRefreshLock<T>(operation: () => Promise<T>): Promise<T> {
  const locks = lockManager();
  if (locks === null) return operation();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REFRESH_LOCK_TIMEOUT_MS);
  let acquired = false;
  try {
    return (await locks.request(
      REFRESH_LOCK_NAME,
      { mode: 'exclusive', signal: controller.signal },
      () => {
        acquired = true;
        clearTimeout(timer);
        return operation();
      },
    )) as T;
  } catch (cause) {
    // Solo el aborto de la ESPERA se traduce; un error de la propia renovación se propaga tal cual.
    if (!acquired) throw new ApiError('network', 0, DEFAULT_MESSAGE_BY_KIND.network);
    throw cause;
  } finally {
    clearTimeout(timer);
  }
}
