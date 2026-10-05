// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';
import {
  appointmentDetail,
  installBackend,
  json,
  passwordScript,
  patientLifecycleScript,
  problem,
  RECOVERY_MESSAGE,
  renderLoggedIn,
  sessionScript,
  SITE_HIC,
  SITE_ICV,
  SPECIALTY_CARDIO,
  withoutBootRefresh,
  type Call,
  type Script,
} from './test/fakeBackend';

/**
 * Huecos del verificador: HU-006 (validación de correo, enlace desde el login, estados loading y
 * error de la solicitud de recuperación) y HU-027 (la reprogramación no ofrece elegir profesional).
 */

function openRecovery(script: Script): Call[] {
  const calls = installBackend(script);
  window.history.replaceState(null, '', '/recuperar-password');
  render(<App />);
  return calls;
}

function submitEmail(value: string) {
  fireEvent.change(screen.getByLabelText(/Correo electrónico/), { target: { value } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar instrucciones' }));
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('recuperar contraseña: validación, enlace y estados (HU-006)', () => {
  it('el login ofrece el enlace "Olvidé mi contraseña" y lleva a la solicitud', async () => {
    installBackend({});
    window.history.replaceState(null, '', '/login');
    render(<App />);

    const link = await screen.findByRole('link', { name: 'Olvidé mi contraseña' });
    expect(link.getAttribute('href')).toBe('/recuperar-password');
    fireEvent.click(link);
    expect(await screen.findByRole('heading', { name: 'Recupera tu contraseña' })).not.toBeNull();
    expect(window.location.pathname).toBe('/recuperar-password');
  });

  it('correo vacío: el cliente muestra el error del campo y no llama a la API', async () => {
    const calls = openRecovery(passwordScript({ validToken: 'tok-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enviar instrucciones' }));

    expect(await screen.findByText('Escribe tu correo electrónico.')).not.toBeNull();
    expect(screen.getByLabelText(/Correo electrónico/).getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText(RECOVERY_MESSAGE)).toBeNull();
    expect(calls.some((call) => call.path === '/api/auth/password-recovery')).toBe(false);
  });

  it('correo sin arroba: el cliente muestra el formato esperado y no llama a la API', async () => {
    const calls = openRecovery(passwordScript({ validToken: 'tok-1' }));
    submitEmail('laura.fcv.test');

    expect(await screen.findByText(/El correo no tiene un formato válido/)).not.toBeNull();
    expect(screen.getByLabelText(/Correo electrónico/).getAttribute('aria-invalid')).toBe('true');
    expect(calls.some((call) => call.path === '/api/auth/password-recovery')).toBe(false);
    // Solo el intento de restaurar sesión del arranque (D36).
    expect(withoutBootRefresh(calls)).toEqual([]);
  });

  it('corregir el correo quita el error y permite enviar', async () => {
    const calls = openRecovery(passwordScript({ validToken: 'tok-1' }));
    submitEmail('sin-arroba');
    await screen.findByText(/El correo no tiene un formato válido/);

    submitEmail('laura@fcv.test');
    expect(await screen.findByText(RECOVERY_MESSAGE)).not.toBeNull();
    expect(screen.queryByText(/El correo no tiene un formato válido/)).toBeNull();
    expect(calls.find((call) => call.path === '/api/auth/password-recovery')?.body).toEqual({
      email: 'laura@fcv.test',
    });
  });

  it('400 del servidor con fieldErrors.email: lo muestra en el campo', async () => {
    openRecovery({
      'POST /api/auth/password-recovery': problem(400, 'La petición contiene campos inválidos', {
        fieldErrors: { email: 'el servidor no acepta este correo' },
      }),
    });
    submitEmail('laura@fcv.test');

    expect(await screen.findByText('el servidor no acepta este correo')).not.toBeNull();
    expect(screen.getByLabelText(/Correo electrónico/).getAttribute('aria-invalid')).toBe('true');
  });

  it('loading: mientras la petición vuela el botón y el campo se deshabilitan y no hay envíos duplicados', async () => {
    let release: (response: Response) => void = () => undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const calls = openRecovery({ 'POST /api/auth/password-recovery': () => pending as unknown as Response });
    submitEmail('laura@fcv.test');

    const busy = await screen.findByRole('button', { name: /Enviando/ });
    expect((busy as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(/Correo electrónico/) as HTMLInputElement).disabled).toBe(true);

    // Un segundo envío (Enter en el formulario) no genera otra petición.
    fireEvent.submit(busy.closest('form') as HTMLFormElement);
    expect(calls.filter((call) => call.path === '/api/auth/password-recovery')).toHaveLength(1);

    release(json(202, { message: RECOVERY_MESSAGE }));
    expect(await screen.findByText(RECOVERY_MESSAGE)).not.toBeNull();
    const again = screen.getByRole('button', { name: 'Enviar de nuevo' }) as HTMLButtonElement;
    expect(again.disabled).toBe(false);
    expect((screen.getByLabelText(/Correo electrónico/) as HTMLInputElement).disabled).toBe(false);
  });

  it('error 5xx: muestra el mensaje genérico del cliente (no el detalle interno), no muestra éxito y deja reintentar', async () => {
    const calls = openRecovery({
      'POST /api/auth/password-recovery': [
        problem(500, 'Error interno del servidor'),
        json(202, { message: RECOVERY_MESSAGE }),
      ],
    });
    submitEmail('laura@fcv.test');

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/El servidor tuvo un problema/);
    expect(screen.queryByText(RECOVERY_MESSAGE)).toBeNull();
    const retry = screen.getByRole('button', { name: 'Enviar instrucciones' }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);

    fireEvent.click(retry);
    expect(await screen.findByText(RECOVERY_MESSAGE)).not.toBeNull();
    await waitFor(() => expect(screen.queryByText(/El servidor tuvo un problema/)).toBeNull());
    expect(calls.filter((call) => call.path === '/api/auth/password-recovery')).toHaveLength(2);
  });
});

describe('reprogramar: el profesional va fijo (HU-027)', () => {
  const ANDRES = { id: 10, fullName: 'Andrés Rincón' };
  const OTHER = { id: 11, fullName: 'Camila Duarte' };
  const SITES = [
    { ...SITE_HIC, address: 'Km 7 vía Piedecuesta', city: 'Piedecuesta', department: 'Santander' },
    { ...SITE_ICV, address: 'Calle 155A', city: 'Floridablanca', department: 'Santander' },
  ];

  function offerOf(professional: typeof ANDRES, startTime: string, endTime: string) {
    return {
      professional,
      site: SITE_HIC,
      specialty: SPECIALTY_CARDIO,
      date: '2026-09-22',
      startTime,
      endTime,
      durationMinutes: 60,
    };
  }

  beforeEach(() => {
    // Lunes 21 de septiembre de 2026, 08:00 en Bogotá.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-21T13:00:00Z'));
  });

  it('no hay selector de profesional y toda búsqueda viaja con el profesional de la cita', async () => {
    const all = [offerOf(ANDRES, '08:00', '09:00'), offerOf(OTHER, '10:00', '11:00')];
    // Como el servidor real: respeta el filtro `professionalId`.
    const filtered = (call: Call) =>
      json(
        200,
        call.query.professionalId === undefined
          ? all
          : all.filter((offer) => String(offer.professional.id) === call.query.professionalId),
      );
    const calls = installBackend({
      ...sessionScript('USER'),
      'GET /api/patient/appointments': json(200, []),
      'GET /api/catalogs/sites': json(200, SITES),
      'GET /api/patient/availability/days': json(200, [{ date: '2026-09-22', offers: 1 }]),
      'GET /api/patient/availability': filtered,
      ...patientLifecycleScript(appointmentDetail()),
    });
    await renderLoggedIn('Laura Gómez', '/paciente/citas/100/reprogramar');
    await screen.findByRole('heading', { level: 1, name: 'Solicitar reprogramación' });
    await screen.findByRole('button', { name: /08:00 a 09:00 con Andrés Rincón en Hospital/ });

    // El profesional se muestra como dato fijo, no como filtro.
    expect(screen.getByText('Profesional (no cambia)')).not.toBeNull();
    expect(screen.queryByRole('group', { name: 'Profesional' })).toBeNull();
    expect(document.getElementById('filtro-profesional')).toBeNull();
    // Ningún otro profesional aparece como opción.
    expect(screen.queryByText(/Camila Duarte/)).toBeNull();

    const searches = calls.filter((call) => call.path.startsWith('/api/patient/availability'));
    expect(searches.length).toBeGreaterThan(0);
    for (const search of searches) expect(search.query.professionalId).toBe('10');
  });
});
