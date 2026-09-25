// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { UserResponse } from './api/contracts';
import {
  affiliation,
  installBackend,
  insurancePlan,
  json,
  passwordScript,
  problem,
  profileScript,
  RECOVERY_MESSAGE,
  renderLoggedIn,
  sessionScript,
  userWith,
  type Call,
  type Script,
  withoutBootRefresh,
} from './test/fakeBackend';

/**
 * Cuenta del paciente (S4): perfil (HU-008), afiliación desde el perfil (HU-009, segundo corte)
 * y recuperación de contraseña (HU-006 paso 1 con token de laboratorio, HU-007).
 */

const BASIC = insurancePlan();
const PLUS = insurancePlan({ id: 4, code: 'CONTRIB_PLUS', name: 'Plan plus' });
/** Está en el catálogo cargado pero el servidor ya no lo acepta (422). */
const RETIRED = insurancePlan({ id: 5, code: 'RETIRADO', name: 'Plan retirado' });

function profile(user: UserResponse, extra: Script = {}): Script {
  return {
    ...sessionScript('USER'),
    'GET /api/patient/appointments': json(200, []),
    'GET /api/catalogs/insurance-plans': json(200, [BASIC, PLUS, RETIRED]),
    ...profileScript(user, [BASIC, PLUS]),
    ...extra,
  };
}

function patient(overrides: Record<string, unknown> = {}): UserResponse {
  return userWith('USER', overrides) as UserResponse;
}

async function openProfile(script: Script): Promise<Call[]> {
  const calls = installBackend(script);
  await renderLoggedIn('Laura Gómez', '/paciente/perfil');
  await screen.findByRole('heading', { level: 1, name: 'Mi perfil' });
  return calls;
}

function card(name: string): HTMLElement {
  return screen.getByRole('region', { name });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('perfil (HU-008)', () => {
  it('se abre desde el menú y el inicio; editables y de solo lectura según el servidor', async () => {
    installBackend(profile(patient()));
    await renderLoggedIn('Laura Gómez');
    expect((await screen.findByRole('link', { name: /Mi perfil y afiliación/ })).getAttribute('href')).toBe('/paciente/perfil');
    const nav = screen.getByRole('complementary', { name: 'Navegación principal' });
    fireEvent.click(within(nav).getByRole('link', { name: 'Mi perfil' }));
    await screen.findByRole('heading', { level: 1, name: 'Mi perfil' });

    const personal = card('Datos personales');
    expect((within(personal).getByLabelText(/Nombres/) as HTMLInputElement).value).toBe('Laura');
    expect((within(personal).getByLabelText(/Teléfono/) as HTMLInputElement).value).toBe('3001234567');
    // Correo y documento: en consulta, no como campos.
    expect(within(personal).queryByRole('textbox', { name: /Correo/ })).toBeNull();
    expect(within(personal).getByText('persona@fcv.test')).not.toBeNull();
    expect(within(personal).getByText(/no se pueden cambiar desde aquí/)).not.toBeNull();
    // Sin cambios no hay nada que guardar.
    expect((within(personal).getByRole('button', { name: 'Guardar cambios' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('guarda nombres y teléfono, y el marco muestra el nombre nuevo', async () => {
    const calls = await openProfile(profile(patient()));
    const personal = card('Datos personales');

    fireEvent.change(within(personal).getByLabelText(/Nombres/), { target: { value: ' Laura María ' } });
    fireEvent.change(within(personal).getByLabelText(/Teléfono/), { target: { value: '3109998888' } });
    fireEvent.click(within(personal).getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Laura María Gómez')).not.toBeNull();
    expect(await within(personal).findByText('Tus datos quedaron guardados.')).not.toBeNull();
    const put = calls.find((call) => call.method === 'PUT' && call.path === '/api/me');
    expect(put?.body).toEqual({ firstNames: 'Laura María', lastNames: 'Gómez', phone: '3109998888' });
  });

  it('valida en el cliente antes de enviar', async () => {
    const calls = await openProfile(profile(patient()));
    const personal = card('Datos personales');
    fireEvent.change(within(personal).getByLabelText(/Teléfono/), { target: { value: '12' } });
    fireEvent.click(within(personal).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(personal).findByText(/al menos 7 dígitos/)).not.toBeNull();
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  });

  it('400 FIELD_NOT_EDITABLE: muestra el mensaje del servidor con el campo', async () => {
    await openProfile(
      profile(patient(), {
        'PUT /api/me': problem(400, 'Ese dato no se puede editar', { code: 'FIELD_NOT_EDITABLE', field: 'email' }),
      }),
    );
    const personal = card('Datos personales');
    fireEvent.change(within(personal).getByLabelText(/Apellidos/), { target: { value: 'Gómez Ruiz' } });
    fireEvent.click(within(personal).getByRole('button', { name: 'Guardar cambios' }));
    const alert = await within(personal).findByRole('alert');
    expect(alert.textContent).toMatch(/Ese dato no se puede editar \(campo: correo electrónico\)/);
  });

  it('400 con fieldErrors: el mensaje del servidor aparece en su campo', async () => {
    await openProfile(
      profile(patient(), {
        'PUT /api/me': problem(400, 'La petición contiene campos inválidos', {
          code: 'VALIDATION',
          fieldErrors: { phone: 'El teléfono ya no es válido para el servidor' },
        }),
      }),
    );
    const personal = card('Datos personales');
    fireEvent.change(within(personal).getByLabelText(/Teléfono/), { target: { value: '3001112222' } });
    fireEvent.click(within(personal).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(personal).findByText('El teléfono ya no es válido para el servidor')).not.toBeNull();
    expect(within(personal).getByLabelText(/Teléfono/).getAttribute('aria-invalid')).toBe('true');
  });
});

describe('afiliación desde el perfil (HU-009, segundo corte)', () => {
  it('sin afiliación: lo dice y permite registrar un plan del catálogo', async () => {
    const calls = await openProfile(profile(patient()));
    const section = card('Afiliación');
    expect(within(section).getByText('Sin afiliación')).not.toBeNull();

    const select = await within(section).findByLabelText(/Plan de afiliación/);
    await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false));
    expect(within(section).getByRole('option', { name: 'EPS de prueba · Plan plus · Régimen contributivo' })).not.toBeNull();
    fireEvent.change(select, { target: { value: '4' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar afiliación' }));

    expect(await within(section).findByText('Plan plus · Régimen contributivo')).not.toBeNull();
    expect(calls.find((call) => call.method === 'PUT' && call.path === '/api/me/affiliation')?.body).toEqual({
      insurancePlanId: 4,
    });
  });

  it('cambia el plan vigente', async () => {
    await openProfile(profile(patient({ affiliation: affiliation() })));
    const section = card('Afiliación');
    expect(within(section).getByText('Plan básico · Régimen contributivo')).not.toBeNull();

    const select = within(section).getByLabelText(/Cambiar a otro plan/);
    await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false));
    // El plan vigente no se "cambia" por sí mismo.
    fireEvent.change(select, { target: { value: '3' } });
    expect((within(section).getByRole('button', { name: 'Cambiar plan' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(select, { target: { value: '4' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Cambiar plan' }));

    expect(await within(section).findByText('Plan plus · Régimen contributivo')).not.toBeNull();
    expect(await screen.findByText('Afiliación actualizada')).not.toBeNull();
  });

  it('422 INSURANCE_PLAN_UNAVAILABLE: el mensaje del servidor va bajo el selector', async () => {
    await openProfile(profile(patient()));
    const section = card('Afiliación');
    const select = within(section).getByLabelText(/Plan de afiliación/);
    await waitFor(() => expect((select as HTMLSelectElement).disabled).toBe(false));
    fireEvent.change(select, { target: { value: '5' } });
    fireEvent.click(within(section).getByRole('button', { name: 'Guardar afiliación' }));

    expect(await within(section).findByText('El plan de EPS seleccionado no está disponible')).not.toBeNull();
    expect(within(section).getByText('Sin afiliación')).not.toBeNull();
  });

  it('quita la afiliación tras confirmar', async () => {
    const calls = await openProfile(profile(patient({ affiliation: affiliation() })));
    const section = card('Afiliación');
    fireEvent.click(within(section).getByRole('button', { name: 'Quitar afiliación' }));

    const dialog = await screen.findByRole('alertdialog', { name: '¿Quitar tu afiliación?' });
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'No, conservarla' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, quitar afiliación' }));

    expect(await within(section).findByText('Sin afiliación')).not.toBeNull();
    expect(calls.some((call) => call.method === 'DELETE' && call.path === '/api/me/affiliation')).toBe(true);
  });
});

describe('restablecer contraseña (HU-007)', () => {
  function openReset(path: string, script: Script): Call[] {
    const calls = installBackend(script);
    window.history.replaceState(null, '', path);
    render(<App />);
    return calls;
  }

  function fill(password: string, confirm = password) {
    fireEvent.change(screen.getByLabelText(/Nueva contraseña/), { target: { value: password } });
    fireEvent.change(screen.getByLabelText(/Confirmar contraseña/), { target: { value: confirm } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
  }

  it('éxito con una contraseña de letras Unicode (D29) y enlace al login', async () => {
    const calls = openReset('/restablecer-password?token=tok-1', passwordScript({ validToken: 'tok-1' }));
    await screen.findByRole('heading', { name: 'Crea una nueva contraseña' });
    fill('ññññññ12');

    expect(await screen.findByText('Tu contraseña se cambió correctamente.')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe('/login');
    expect(calls.find((call) => call.path === '/api/auth/password-reset')).toMatchObject({
      body: { token: 'tok-1', newPassword: 'ññññññ12' },
      authorization: undefined,
    });
  });

  it('token inválido: muestra el error del servidor y ofrece pedir otro enlace', async () => {
    openReset('/restablecer-password?token=caducado', passwordScript({ validToken: 'tok-1' }));
    await screen.findByRole('heading', { name: 'Crea una nueva contraseña' });
    fill('Nueva-clave1');

    expect(await screen.findByText(/El enlace no es válido o ha caducado/)).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Pedir otro enlace' }).getAttribute('href')).toBe('/recuperar-password');
    expect(screen.queryByLabelText(/Nueva contraseña/)).toBeNull();
  });

  it('política en el cliente: no envía una contraseña sin letras ni una confirmación distinta', async () => {
    const calls = openReset('/restablecer-password?token=tok-1', passwordScript({ validToken: 'tok-1' }));
    await screen.findByRole('heading', { name: 'Crea una nueva contraseña' });
    fill('12345678');
    expect(await screen.findByText(/combinar al menos una letra y un número/)).not.toBeNull();
    fill('clave1234', 'clave12345');
    expect(await screen.findByText('Las dos contraseñas no coinciden.')).not.toBeNull();
    expect(calls.some((call) => call.path === '/api/auth/password-reset')).toBe(false);
  });

  it('fieldErrors.newPassword del servidor aparece en su campo', async () => {
    openReset('/restablecer-password?token=tok-1', {
      'POST /api/auth/password-reset': problem(400, 'La petición contiene campos inválidos', {
        code: 'VALIDATION',
        fieldErrors: { newPassword: 'La contraseña no cumple la política del servidor' },
      }),
    });
    await screen.findByRole('heading', { name: 'Crea una nueva contraseña' });
    fill('Nueva-clave1');
    expect(await screen.findByText('La contraseña no cumple la política del servidor')).not.toBeNull();
    expect(screen.getByLabelText(/Nueva contraseña/).getAttribute('aria-invalid')).toBe('true');
  });

  it('seguridad: al montar quita el token de la URL sin añadir historial y lo sigue usando', async () => {
    const calls = openReset('/restablecer-password?token=tok-1&utm=correo', passwordScript({ validToken: 'tok-1' }));
    const entries = window.history.length;
    await screen.findByRole('heading', { name: 'Crea una nueva contraseña' });

    // La barra ya no lleva el token; los demás parámetros se conservan y no hay entrada nueva.
    await waitFor(() => expect(window.location.search).toBe('?utm=correo'));
    expect(window.location.pathname).toBe('/restablecer-password');
    expect(window.location.href).not.toContain('tok-1');
    expect(window.history.length).toBe(entries);

    // El formulario sigue disponible y el token (guardado en el estado) viaja en el cuerpo.
    fill('Nueva-clave1');
    expect(await screen.findByText('Tu contraseña se cambió correctamente.')).not.toBeNull();
    expect(calls.find((call) => call.path === '/api/auth/password-reset')?.body).toEqual({
      token: 'tok-1',
      newPassword: 'Nueva-clave1',
    });
  });

  it('sin token en el enlace: lo explica y ofrece pedir otro', async () => {
    const calls = openReset('/restablecer-password', {});
    expect(await screen.findByText(/El enlace está incompleto/)).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Pedir otro enlace' })).not.toBeNull();
    // Solo el intento de restaurar sesión del arranque (D36); la pantalla no llamó a la API.
    expect(withoutBootRefresh(calls)).toEqual([]);
  });
});

describe('recuperar contraseña con token de laboratorio (HU-006)', () => {
  it('muestra el mensaje neutro y, si llega devToken, lo marca como dato de laboratorio con enlace', async () => {
    installBackend(passwordScript({ validToken: 'tok-9', knownEmails: ['laura@fcv.test'], exposeToken: true }));
    window.history.replaceState(null, '', '/recuperar-password');
    render(<App />);

    fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'laura@fcv.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instrucciones' }));

    expect(await screen.findByText(RECOVERY_MESSAGE)).not.toBeNull();
    expect(screen.getByText('Dato de laboratorio')).not.toBeNull();
    const link = screen.getByRole('link', { name: 'Restablecer la contraseña con este token' });
    expect(link.getAttribute('href')).toBe('/restablecer-password?token=tok-9');

    fireEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Crea una nueva contraseña' })).not.toBeNull();
  });

  it('sin devToken no muestra nada de laboratorio', async () => {
    installBackend(passwordScript({ validToken: 'tok-9', knownEmails: [], exposeToken: true }));
    window.history.replaceState(null, '', '/recuperar-password');
    render(<App />);
    fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value: 'otra@fcv.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instrucciones' }));
    expect(await screen.findByText(RECOVERY_MESSAGE)).not.toBeNull();
    expect(screen.queryByText('Dato de laboratorio')).toBeNull();
  });
});
