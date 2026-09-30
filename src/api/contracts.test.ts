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

/**
 * F9 · Alineación con el backend real (2026-09-30). Estas listas se copiaron de
 * `citas-api/src/main/java` (controladores y excepciones con `code`): si el backend cambia, este
 * test debe cambiar a propósito, no el cliente por inercia.
 */
describe('alineación con citas-api', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const BACKEND_ERROR_CODES = [
    'APPOINTMENT_EXPIRED',
    'APPOINTMENT_NOT_STARTED',
    'BLOCK_HAS_APPOINTMENTS',
    'BLOCK_OVERLAP',
    'CONCURRENT_CHANGE',
    'DUPLICATE',
    'EPS_REFERENCED',
    'FIELD_NOT_EDITABLE',
    'INSURANCE_PLAN_UNAVAILABLE',
    'INVALID_TRANSITION',
    'NOT_FOUND',
    'PAST_TIME',
    'PLAN_REFERENCED',
    'PROFESSIONAL_INACTIVE',
    'PROTECTED_SPECIALTY',
    'RESCHEDULE_PENDING',
    'RESET_TOKEN_INVALID',
    'SAME_SLOT',
    'SITE_NOT_ASSIGNED',
    'SLOT_NOT_AVAILABLE',
    'SLOT_TAKEN',
    'SPECIALTY_INACTIVE',
    'SPECIALTY_NOT_ASSIGNED',
    'SPECIALTY_REFERENCED',
    'VALIDATION',
    'WRONG_FLOW',
  ];

  it('ERROR_CODES contiene exactamente los códigos que emite el backend', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    vi.resetModules();
    const { ERROR_CODES } = await import('./contracts');
    expect(Object.values(ERROR_CODES).sort()).toEqual([...BACKEND_ERROR_CODES].sort());
  });

  it('API_ROUTES solo declara rutas que existen en los controladores', async () => {
    vi.stubEnv('VITE_API_URL', 'http://api.test');
    vi.resetModules();
    const { API_ROUTES } = await import('./contracts');
    const BACKEND_ROUTES = new Set([
      '/api/auth/register', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout',
      '/api/auth/password-recovery', '/api/auth/password-reset',
      '/api/me', '/api/me/affiliation',
      '/api/catalogs/sites', '/api/catalogs/specialties', '/api/catalogs/appointment-types',
      '/api/catalogs/appointment-statuses', '/api/catalogs/reschedule-statuses',
      '/api/catalogs/document-types', '/api/catalogs/roles', '/api/catalogs/regimes',
      '/api/catalogs/insurance-plans',
      '/api/admin/specialties', '/api/admin/specialties/:id', '/api/admin/specialties/:id/status',
      '/api/admin/professionals', '/api/admin/professionals/:id',
      '/api/admin/professionals/:id/specialties', '/api/admin/professionals/:id/sites',
      '/api/admin/professionals/:id/status',
      '/api/admin/inbox', '/api/admin/appointments/:id', '/api/admin/appointments/:id/approve',
      '/api/admin/appointments/:id/reject', '/api/admin/summary',
      '/api/admin/reschedules/:id/approve', '/api/admin/reschedules/:id/reject',
      '/api/admin/eps', '/api/admin/eps/:id', '/api/admin/eps/:id/status', '/api/admin/eps/:id/plans',
      '/api/admin/eps-plans/:id', '/api/admin/eps-plans/:id/status',
      '/api/professional/me', '/api/professional/blocks', '/api/professional/blocks/:id',
      '/api/professional/appointments', '/api/professional/appointments/:id/complete',
      '/api/professional/appointments/:id/no-show',
      '/api/patient/availability', '/api/patient/availability/days',
      '/api/patient/appointments/general', '/api/patient/appointments/specialized',
      '/api/patient/appointments', '/api/patient/appointments/:id',
      '/api/patient/appointments/:id/cancel', '/api/patient/appointments/:id/reschedule',
    ]);
    const found: string[] = [];
    const walk = (node: unknown): void => {
      if (typeof node === 'string') found.push(node);
      else if (typeof node === 'function') found.push((node as (id: number) => string)(7).replace('7', ':id'));
      else if (node !== null && typeof node === 'object') Object.values(node).forEach(walk);
    };
    walk(API_ROUTES);
    expect(found.length).toBe(BACKEND_ROUTES.size);
    expect(found.filter((route) => !BACKEND_ROUTES.has(route))).toEqual([]);
  });
});
