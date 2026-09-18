/**
 * Cambia la zona horaria del proceso de pruebas (Node relee `TZ` en caliente). Sirve para
 * comprobar que la UI no depende de la zona del navegador. El tsconfig de la app no incluye
 * los tipos de Node, así que `process` se accede de forma tipada aquí.
 */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env;

/** Fija `TZ` y devuelve la función que restaura el valor anterior. */
export function setTimeZone(timeZone: string): () => void {
  const previous = env.TZ;
  env.TZ = timeZone;
  return () => {
    if (previous === undefined) delete env.TZ;
    else env.TZ = previous;
  };
}
