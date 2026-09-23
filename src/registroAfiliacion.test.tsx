// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import { installBackend, json, problem, type Call, type Script } from './test/fakeBackend';

/**
 * RF-01 · Plan de afiliación OPCIONAL en el registro público de pacientes.
 *
 * El catálogo `GET /api/catalogs/insurance-plans` es la única lectura pública (quien se registra
 * no tiene sesión). El campo nunca puede impedir el alta: si el catálogo falla, el formulario
 * sigue permitiendo registrarse sin plan.
 *
 * Datos sintéticos: EPS, planes y personas son ficticios (PRD §1).
 */

const PLANS = [
  {
    id: 1,
    code: 'BA_CONTRIB_BASICO',
    name: 'Plan Contributivo Basico',
    eps: { id: 1, code: 'EPS_BIENESTAR_ANDINO', name: 'Bienestar Andino EPS' },
    regime: { id: 1, code: 'CONTRIBUTIVO', name: 'Régimen contributivo' },
  },
  {
    id: 2,
    code: 'BA_CONTRIB_PLUS',
    name: 'Plan Contributivo Plus',
    eps: { id: 1, code: 'EPS_BIENESTAR_ANDINO', name: 'Bienestar Andino EPS' },
    regime: { id: 1, code: 'CONTRIBUTIVO', name: 'Régimen contributivo' },
  },
  {
    id: 3,
    code: 'SIO_SUBSIDIADO',
    name: 'Plan Subsidiado Oriente',
    eps: { id: 2, code: 'EPS_SALUD_INTEGRAL_ORIENTE', name: 'Salud Integral del Oriente' },
    regime: { id: 2, code: 'SUBSIDIADO', name: 'Régimen subsidiado' },
  },
];

const REGISTRATION = {
  firstNames: 'Ana',
  lastNames: 'Pérez',
  documentType: 'CC',
  documentNumber: '1001',
  email: 'ana@fcv.test',
  phone: '3001234567',
  password: 'Clave-Secreta#2026',
};

const CREATED_USER = { id: 1, ...REGISTRATION, password: undefined, roles: ['USER'] };

function renderRegistro(script: Script): Call[] {
  const calls = installBackend(script);
  window.history.replaceState(null, '', '/registro');
  render(<App />);
  return calls;
}

/** Rellena los campos obligatorios; el plan de afiliación se elige aparte porque es opcional. */
function fillRequiredFields() {
  const type = (label: RegExp, value: string) => {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  };
  type(/^Nombres/, REGISTRATION.firstNames);
  type(/^Apellidos/, REGISTRATION.lastNames);
  type(/^Tipo de documento/, REGISTRATION.documentType);
  type(/^Número de documento/, REGISTRATION.documentNumber);
  type(/^Correo electrónico/, REGISTRATION.email);
  type(/^Teléfono/, REGISTRATION.phone);
  type(/^Contraseña/, REGISTRATION.password);
  type(/^Confirmar contraseña/, REGISTRATION.password);
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }));
}

const planSelect = () => screen.getByLabelText(/^Plan de afiliación/) as HTMLSelectElement;

/** El campo llega deshabilitado mientras carga el catálogo; espera a que esté operativo. */
async function waitForPlansLoaded() {
  await waitFor(() => {
    expect(planSelect().disabled).toBe(false);
  });
}

function registerCall(calls: Call[]): Call | undefined {
  return calls.find((call) => call.path === '/api/auth/register');
}

beforeEach(() => {
  window.history.replaceState(null, '', '/registro');
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('registro · plan de afiliación opcional (RF-01)', () => {
  it('llena el desplegable con los planes de la API y arranca en la opción vacía', async () => {
    const calls = renderRegistro({ 'GET /api/catalogs/insurance-plans': json(200, PLANS) });

    await waitForPlansLoaded();

    // Opción vacía seleccionada de inicio: registrarse sin afiliación es lo predeterminado.
    expect(planSelect().value).toBe('');

    // Etiqueta con EPS, plan y régimen: dos planes distintos pueden compartir nombre.
    const options = within(planSelect())
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(options).toEqual([
      'Sin afiliación / La agrego después',
      'Bienestar Andino EPS · Plan Contributivo Basico · Régimen contributivo',
      'Bienestar Andino EPS · Plan Contributivo Plus · Régimen contributivo',
      'Salud Integral del Oriente · Plan Subsidiado Oriente · Régimen subsidiado',
    ]);

    // El catálogo es público: se pide sin token.
    const catalogCall = calls.find((call) => call.path === '/api/catalogs/insurance-plans');
    expect(catalogCall?.authorization).toBeUndefined();
  });

  it('sin elegir plan, la petición no incluye insurancePlanId', async () => {
    const calls = renderRegistro({
      'GET /api/catalogs/insurance-plans': json(200, PLANS),
      'POST /api/auth/register': json(201, CREATED_USER),
    });

    await waitForPlansLoaded();
    fillRequiredFields();
    submit();

    await screen.findByRole('heading', { name: 'Inicia sesión' });
    const body = registerCall(calls)?.body as Record<string, unknown>;
    // Ni `null` ni cadena vacía: la clave no viaja.
    expect(Object.hasOwn(body, 'insurancePlanId')).toBe(false);
    expect(body).toEqual(REGISTRATION);
  });

  it('al elegir un plan, la petición lo incluye con el id correcto', async () => {
    const calls = renderRegistro({
      'GET /api/catalogs/insurance-plans': json(200, PLANS),
      'POST /api/auth/register': json(201, CREATED_USER),
    });

    await waitForPlansLoaded();
    fillRequiredFields();
    fireEvent.change(planSelect(), { target: { value: '3' } });
    submit();

    await screen.findByRole('heading', { name: 'Inicia sesión' });
    expect(registerCall(calls)?.body).toEqual({ ...REGISTRATION, insurancePlanId: 3 });
  });

  it('un 422 INSURANCE_PLAN_UNAVAILABLE se muestra junto al campo y conserva los datos', async () => {
    const detail = 'Ese plan ya no está disponible. Elige otro o continúa sin afiliación.';
    renderRegistro({
      'GET /api/catalogs/insurance-plans': json(200, PLANS),
      'POST /api/auth/register': problem(422, detail, { code: 'INSURANCE_PLAN_UNAVAILABLE' }),
    });

    await waitForPlansLoaded();
    fillRequiredFields();
    fireEvent.change(planSelect(), { target: { value: '2' } });
    submit();

    const message = await screen.findByText(detail);
    // El error va enlazado al campo por `aria-describedby`, no suelto en la página.
    const select = planSelect();
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(select.getAttribute('aria-describedby')?.split(' ')).toContain(message.id);

    // Sigue en el registro y no se perdió nada de lo ya escrito.
    expect(screen.getByRole('heading', { name: 'Crea tu cuenta' })).not.toBeNull();
    expect((screen.getByLabelText(/^Correo electrónico/) as HTMLInputElement).value).toBe(
      REGISTRATION.email,
    );
    expect((screen.getByLabelText(/^Nombres/) as HTMLInputElement).value).toBe(
      REGISTRATION.firstNames,
    );
    expect(select.value).toBe('2');
    expect(screen.getByRole('button', { name: 'Crear cuenta' }).hasAttribute('disabled')).toBe(false);
  });

  it('si el catálogo falla, el campo se degrada y el registro sigue siendo posible sin plan', async () => {
    const calls = renderRegistro({
      'GET /api/catalogs/insurance-plans': problem(500, 'Catálogo no disponible'),
      'POST /api/auth/register': json(201, CREATED_USER),
    });

    // Campo deshabilitado con explicación, pero sin bloquear el formulario.
    expect(
      await screen.findByText(/No pudimos cargar los planes de afiliación/),
    ).not.toBeNull();
    expect(planSelect().disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Crear cuenta' }).hasAttribute('disabled')).toBe(false);

    fillRequiredFields();
    submit();

    await screen.findByRole('heading', { name: 'Inicia sesión' });
    expect(registerCall(calls)?.body).toEqual(REGISTRATION);
  });
});
