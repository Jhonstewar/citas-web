/**
 * Ejecución única compartida.
 *
 * Mientras una ejecución está en curso, toda llamada nueva recibe ESA misma
 * promesa en lugar de lanzar otra. Se usa para la renovación de sesión: el
 * refresh token rota en cada renovación (dec-002), así que dos renovaciones
 * simultáneas presentarían el mismo token antiguo y la segunda se leería como
 * reuso, revocando la familia completa y expulsando al usuario.
 */
export interface SingleFlight<T> {
  /** Lanza la operación, o devuelve la que ya está en curso. */
  run: () => Promise<T>;
  /** Olvida la ejecución en curso; la siguiente llamada arranca una nueva. */
  reset: () => void;
}

export function createSingleFlight<T>(operation: () => Promise<T>): SingleFlight<T> {
  let inFlight: Promise<T> | null = null;

  return {
    run(): Promise<T> {
      if (inFlight !== null) return inFlight;

      // `finally` limpia tanto en éxito como en fallo: un rechazo no puede
      // dejar la ranura ocupada para siempre. Solo la libera si sigue siendo
      // suya: tras un `reset()` la ocupa otra ejecución, y liberarla permitiría
      // dos renovaciones a la vez con el mismo refresh token.
      const pending: Promise<T> = operation().finally(() => {
        if (inFlight === pending) inFlight = null;
      });
      inFlight = pending;
      return pending;
    },

    reset(): void {
      inFlight = null;
    },
  };
}
