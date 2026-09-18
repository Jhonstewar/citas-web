import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * La URL del backend llega solo por `VITE_API_URL`: sin ella no hay host supuesto.
 * Cada prueba reimporta el módulo porque la URL se resuelve al cargarlo.
 */
describe('API_BASE_URL', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('toma VITE_API_URL y le quita la barra final', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test/');
    const { API_BASE_URL } = await import('./contracts');
    expect(API_BASE_URL).toBe('http://api.test');
  });

  it('falla al cargar si VITE_API_URL está vacía, en vez de usar un valor por defecto', async () => {
    vi.stubEnv('VITE_API_URL', '');
    await expect(import('./contracts')).rejects.toThrow(/Falta VITE_API_URL/);
  });
});
