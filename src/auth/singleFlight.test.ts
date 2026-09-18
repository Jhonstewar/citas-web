import { describe, expect, it, vi } from 'vitest';
import { createSingleFlight } from './singleFlight';

/** Promesa que resuelve cuando la prueba lo decide. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createSingleFlight', () => {
  it('comparte una única ejecución entre las llamadas concurrentes', async () => {
    const gate = deferred<number>();
    const operation = vi.fn(() => gate.promise);
    const flight = createSingleFlight(operation);

    const [a, b, c] = [flight.run(), flight.run(), flight.run()];
    gate.resolve(7);

    expect(await Promise.all([a, b, c])).toEqual([7, 7, 7]);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('arranca una ejecución nueva cuando la anterior ya terminó', async () => {
    let calls = 0;
    const flight = createSingleFlight(async () => {
      calls += 1;
      return calls;
    });

    expect(await flight.run()).toBe(1);
    expect(await flight.run()).toBe(2);
  });

  it('libera la ranura cuando la operación falla', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('falla'))
      .mockResolvedValueOnce('bien');
    const flight = createSingleFlight(operation);

    await expect(flight.run()).rejects.toThrow('falla');
    await expect(flight.run()).resolves.toBe('bien');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('reset olvida la ejecución en curso', async () => {
    const gate = deferred<string>();
    const operation = vi.fn(() => gate.promise);
    const flight = createSingleFlight(operation);

    void flight.run();
    flight.reset();
    void flight.run();

    gate.resolve('x');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('la ejecución olvidada por reset no libera la ranura de la siguiente al terminar', async () => {
    const old = deferred<string>();
    const current = deferred<string>();
    const operation = vi
      .fn<() => Promise<string>>()
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(current.promise);
    const flight = createSingleFlight(operation);

    const stale = flight.run();
    flight.reset();
    const running = flight.run();

    old.resolve('vieja');
    await stale;

    // La ejecución en curso sigue ocupando la ranura: no se lanza una tercera.
    expect(flight.run()).toBe(running);
    expect(operation).toHaveBeenCalledTimes(2);

    current.resolve('nueva');
    await expect(running).resolves.toBe('nueva');
  });
});
