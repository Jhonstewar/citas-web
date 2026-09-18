// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  goTo,
  installBackend,
  json,
  problem,
  renderLoggedIn,
  sessionScript,
  type Call,
  type Script,
} from './test/fakeBackend';
import { setTimeZone } from './test/timeZone';

/**
 * Paciente (HU-022..025): asistente de reserva general y especializada, 409 SLOT_TAKEN con
 * recarga de franjas, 422 con `detail`, Mis citas con filtros del catálogo y detalle con el
 * motivo de rechazo solo cuando existe (HU-025 CA-06, HU-030 CA-06).
 */

const HIC = { id: 1, code: 'HIC', name: 'Hospital Internacional de Colombia' };
const ICV = { id: 2, code: 'ICV', name: 'Instituto del Corazón' };
const GENERAL = {
  id: 1,
  code: 'MEDICINA_GENERAL',
  name: 'Medicina General',
  appointmentType: 'GENERAL',
  durationMinutes: 30,
  requiresAdminApproval: false,
  active: true,
  protected: true,
};
const CARDIO = {
  id: 2,
  code: 'CARDIOLOGIA',
  name: 'Cardiología',
  appointmentType: 'SPECIALIZED',
  durationMinutes: 60,
  requiresAdminApproval: true,
  active: true,
  protected: false,
};

function offer(professional: { id: number; fullName: string }, site: typeof HIC, specialty: typeof GENERAL, start: string, end: string) {
  const { requiresAdminApproval: _r, active: _a, protected: _p, ...ref } = specialty;
  return { professional, site, specialty: ref, date: '2026-09-22', startTime: start, endTime: end, durationMinutes: specialty.durationMinutes };
}

const RINCON = { id: 10, fullName: 'Andrés Rincón' };
const SERRANO = { id: 11, fullName: 'Paula Serrano' };

function appointment(status: string, statusName: string, extra: Record<string, unknown> = {}) {
  return {
    id: 99,
    status,
    statusName,
    date: '2026-09-22',
    startTime: '08:30',
    endTime: '09:00',
    durationMinutes: 30,
    site: HIC,
    professional: RINCON,
    specialty: { id: 1, code: 'MEDICINA_GENERAL', name: 'Medicina General', appointmentType: 'GENERAL', durationMinutes: 30 },
    rejectionReason: null,
    createdAt: '2026-09-21T08:00:00.123456',
    ...extra,
  };
}

function bookingScript(extra: Script = {}): Script {
  return {
    ...sessionScript('USER'),
    'GET /api/patient/appointments': json(200, []),
    'GET /api/catalogs/appointment-types': json(200, [
      { code: 'GENERAL', name: 'Cita general', requiresAdminApproval: false },
      { code: 'SPECIALIZED', name: 'Cita especializada', requiresAdminApproval: true },
    ]),
    'GET /api/catalogs/specialties': json(200, [GENERAL, CARDIO]),
    'GET /api/catalogs/sites': json(200, [
      { ...HIC, address: 'Km 7 vía Piedecuesta', city: 'Floridablanca', department: 'Santander' },
      { ...ICV, address: 'Calle 155A', city: 'Floridablanca', department: 'Santander' },
    ]),
    'GET /api/patient/availability/days': json(200, [{ date: '2026-09-22', offers: 3 }]),
    ...extra,
  };
}

function continueWizard() {
  fireEvent.click(screen.getByRole('button', { name: /Continuar/ }));
}

async function startBooking(script: Script): Promise<Call[]> {
  const calls = installBackend(script);
  await renderLoggedIn('Laura Gómez', '/paciente/agendar');
  await screen.findByRole('heading', { name: 'Agendar cita' });
  return calls;
}

beforeEach(() => {
  // Lunes 21 de septiembre de 2026, 08:00 en Bogotá.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-21T13:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('asistente de reserva', () => {
  it('cita general: preselecciona Medicina General, resalta los días con cupo y confirma al instante', async () => {
    const calls = await startBooking(
      bookingScript({
        'GET /api/patient/availability': json(200, [
          offer(RINCON, HIC, GENERAL, '08:00', '08:30'),
          offer(RINCON, HIC, GENERAL, '08:30', '09:00'),
          offer(SERRANO, ICV, GENERAL, '09:00', '09:30'),
        ]),
        'POST /api/patient/appointments/general': json(201, appointment('APPROVED', 'Aprobada')),
      }),
    );

    // F2: el nombre del catálogo se usa tal cual ("Cita general"), sin duplicar "Cita".
    expect(screen.queryByText(/Cita cita/i)).toBeNull();
    expect(screen.getByText('Cita general', { selector: '.choice__label' })).not.toBeNull();
    expect(screen.getByText('Cita especializada', { selector: '.choice__label' })).not.toBeNull();
    // "Continuar" no avanza sin elegir.
    expect(screen.getByRole('button', { name: /Continuar/ }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /Cita general/ }));
    continueWizard();

    const medicine = await screen.findByRole('radio', { name: /Medicina General/ });
    expect((medicine as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('radio', { name: /Cardiología/ })).toBeNull();
    continueWizard();

    // Día con cupo resaltado y el resto deshabilitado "Sin cupo".
    const withSlots = await screen.findByRole('button', { name: /22 de septiembre de 2026, 3 franjas/ });
    expect(withSlots.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByRole('button', { name: /23 de septiembre de 2026, Sin cupo/ }).hasAttribute('disabled'),
    ).toBe(true);
    const daysCall = calls.find((call) => call.path === '/api/patient/availability/days');
    expect(daysCall?.query).toEqual({ specialtyId: '1', from: '2026-09-21', to: '2026-10-04' });

    // Franjas agrupadas por profesional y sede, con la duración.
    expect(await screen.findByRole('heading', { name: /Andrés Rincón/ })).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Paula Serrano/ })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '08:30 a 09:00 con Andrés Rincón en Hospital Internacional de Colombia' }));
    continueWizard();

    expect(await screen.findByText('08:30 – 09:00')).not.toBeNull();
    expect(screen.getByText('30 minutos')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar cita' }));

    expect(await screen.findByRole('heading', { name: '¡Listo! Tu cita quedó confirmada' })).not.toBeNull();
    const post = calls.find((call) => call.method === 'POST' && call.path.startsWith('/api/patient/appointments'));
    expect(post?.path).toBe('/api/patient/appointments/general');
    // La duración no viaja: la fija la especialidad.
    expect(post?.body).toEqual({
      professionalId: 10,
      siteId: 1,
      specialtyId: 1,
      date: '2026-09-22',
      startTime: '08:30',
    });
  });

  it('409 SLOT_TAKEN: avisa, recarga las franjas y deja elegir otra hasta enviar la solicitud', async () => {
    const calls = await startBooking(
      bookingScript({
        'GET /api/patient/availability': [
          json(200, [offer(RINCON, HIC, CARDIO, '08:00', '09:00'), offer(RINCON, HIC, CARDIO, '09:00', '10:00')]),
          json(200, [offer(RINCON, HIC, CARDIO, '09:00', '10:00')]),
        ],
        'POST /api/patient/appointments/specialized': [
          problem(409, 'La franja ya no está disponible', { code: 'SLOT_TAKEN' }),
          json(201, appointment('REQUESTED', 'Solicitada', { startTime: '09:00', endTime: '10:00', durationMinutes: 60 })),
        ],
      }),
    );

    fireEvent.click(screen.getByRole('radio', { name: /Cita especializada/ }));
    continueWizard();
    fireEvent.click(await screen.findByRole('radio', { name: /Cardiología/ }));
    fireEvent.click(screen.getByRole('button', { name: /Instituto del Corazón/ }));
    continueWizard();

    fireEvent.click(await screen.findByRole('button', { name: /^08:00 a 09:00/ }));
    continueWizard();
    expect(await screen.findByText(/se enviará como/)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }));

    // Vuelve al paso de fecha y hora con el aviso, y las franjas se recargan sin la tomada.
    expect(await screen.findByText('Esa franja acaba de ser tomada por otra persona.')).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Paso 3 de 4/ })).not.toBeNull();
    await waitFor(() => {
      expect(calls.filter((call) => call.path === '/api/patient/availability')).toHaveLength(2);
    });
    expect(await screen.findByRole('button', { name: /^09:00 a 10:00/ })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /^08:00 a 09:00/ })).toBeNull();
    // La sede elegida viaja como filtro.
    expect(calls.find((call) => call.path === '/api/patient/availability')?.query.siteId).toBe('2');

    fireEvent.click(await screen.findByRole('button', { name: /^09:00 a 10:00/ }));
    continueWizard();
    fireEvent.click(await screen.findByRole('button', { name: 'Enviar solicitud' }));

    expect(await screen.findByRole('heading', { name: 'Solicitud enviada' })).not.toBeNull();
    expect(screen.getByText('Solicitada')).not.toBeNull();
    const posts = calls.filter((call) => call.path === '/api/patient/appointments/specialized');
    expect(posts.map((call) => (call.body as { startTime: string }).startTime)).toEqual(['08:00', '09:00']);
  });

  it('F4: tras un 409 con filtro de profesional, el filtro se reinicia y no queda una lista vacía', async () => {
    await startBooking(
      bookingScript({
        'GET /api/patient/availability': [
          json(200, [offer(RINCON, HIC, GENERAL, '08:00', '08:30'), offer(SERRANO, ICV, GENERAL, '09:00', '09:30')]),
          // Serrano ya no tiene franjas ese día.
          json(200, [offer(RINCON, HIC, GENERAL, '08:00', '08:30'), offer(RINCON, HIC, GENERAL, '10:00', '10:30')]),
        ],
        'POST /api/patient/appointments/general': problem(409, 'La franja ya no está disponible', { code: 'SLOT_TAKEN' }),
      }),
    );

    fireEvent.click(screen.getByRole('radio', { name: /Cita general/ }));
    continueWizard();
    continueWizard();
    fireEvent.click(await screen.findByRole('button', { name: 'Paula Serrano' }));
    expect(screen.queryByRole('button', { name: /^08:00 a 08:30/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^09:00 a 09:30/ }));
    continueWizard();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar cita' }));

    expect(await screen.findByText('Esa franja acaba de ser tomada por otra persona.')).not.toBeNull();
    expect(await screen.findByRole('button', { name: /^10:00 a 10:30/ })).not.toBeNull();
    expect(screen.getByRole('button', { name: /^08:00 a 08:30/ })).not.toBeNull();
  });

  it('422: muestra el detail del servidor y se queda en la confirmación', async () => {
    await startBooking(
      bookingScript({
        'GET /api/patient/availability': json(200, [offer(RINCON, HIC, GENERAL, '08:00', '08:30')]),
        'POST /api/patient/appointments/general': problem(422, 'El profesional está inactivo', {
          code: 'PROFESSIONAL_INACTIVE',
        }),
      }),
    );

    fireEvent.click(screen.getByRole('radio', { name: /Cita general/ }));
    continueWizard();
    continueWizard();
    fireEvent.click(await screen.findByRole('button', { name: /^08:00 a 08:30/ }));
    continueWizard();
    fireEvent.click(await screen.findByRole('button', { name: 'Confirmar cita' }));

    expect(await screen.findByText('El profesional está inactivo')).not.toBeNull();
    expect(screen.getByRole('heading', { name: /Paso 4 de 4/ })).not.toBeNull();
  });
});

describe('mis citas y detalle', () => {
  const STATUSES = [
    { code: 'REQUESTED', name: 'Solicitada', terminal: false },
    { code: 'APPROVED', name: 'Aprobada', terminal: false },
    { code: 'REJECTED', name: 'Rechazada', terminal: true },
  ];

  it('filtra por estado con las opciones del catálogo de la API (HU-010 CA-08, HU-025 CA-02)', async () => {
    const calls = installBackend({
      ...sessionScript('USER'),
      'GET /api/patient/appointments': json(200, [appointment('APPROVED', 'Aprobada')]),
      'GET /api/catalogs/appointment-statuses': json(200, STATUSES),
    });
    await renderLoggedIn('Laura Gómez', '/paciente/citas');

    fireEvent.click(await screen.findByRole('button', { name: 'Rechazada' }));

    await waitFor(() => {
      const last = calls.filter((call) => call.path === '/api/patient/appointments').at(-1);
      expect(last?.query).toEqual({ status: 'REJECTED' });
    });

    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-22' } });
    await waitFor(() => {
      const last = calls.filter((call) => call.path === '/api/patient/appointments').at(-1);
      expect(last?.query).toEqual({ status: 'REJECTED', date: '2026-09-22' });
    });
  });

  it('una cita rechazada muestra el motivo y el historial (HU-030 CA-06)', async () => {
    installBackend({
      ...sessionScript('USER'),
      'GET /api/patient/appointments': json(200, []),
      'GET /api/patient/appointments/99': json(
        200,
        appointment('REJECTED', 'Rechazada', {
          rejectionReason: 'El profesional no atiende ese día',
          history: [
            { status: 'REQUESTED', statusName: 'Solicitada', source: 'USER', actorName: 'Laura Gómez', reason: null, changedAt: '2026-09-20T10:00:00' },
            { status: 'REJECTED', statusName: 'Rechazada', source: 'ADMIN', actorName: 'Marta Ruiz', reason: 'El profesional no atiende ese día', changedAt: '2026-09-21T07:15:30.5' },
          ],
        }),
      ),
    });
    const restoreTimeZone = setTimeZone('Asia/Tokyo');
    try {
      await renderLoggedIn('Laura Gómez', '/paciente/citas/99');
      expect(await screen.findByText('Motivo del rechazo:')).not.toBeNull();
      // F3: LocalDateTime sin zona = hora de Bogotá, con el navegador en Tokio.
      expect(screen.getByText('por ti · 20 de sept de 2026, 10:00')).not.toBeNull();
      expect(screen.getByText('por Marta Ruiz · 21 de sept de 2026, 07:15')).not.toBeNull();
    } finally {
      restoreTimeZone();
    }
    expect(screen.getAllByText(/El profesional no atiende ese día/).length).toBeGreaterThan(0);
    expect(screen.getByText(/por Marta Ruiz/)).not.toBeNull();
    expect(screen.getByText(/por ti/)).not.toBeNull();
  });

  it('una cita aprobada sin motivo no muestra el campo ni falla (HU-025 CA-06)', async () => {
    installBackend({
      ...sessionScript('USER'),
      'GET /api/patient/appointments': json(200, []),
      'GET /api/patient/appointments/99': json(200, {
        ...appointment('APPROVED', 'Aprobada'),
        rejectionReason: undefined,
        history: [],
      }),
    });
    await renderLoggedIn('Laura Gómez', '/paciente/citas/99');

    expect(await screen.findByText('Datos de la cita')).not.toBeNull();
    expect(screen.getByText('Hospital Internacional de Colombia')).not.toBeNull();
    expect(screen.getByText('30 minutos')).not.toBeNull();
    expect(screen.queryByText(/Motivo del rechazo/)).toBeNull();
  });

  it('una cita ajena (404) se explica sin romper la pantalla', async () => {
    installBackend({
      ...sessionScript('USER'),
      'GET /api/patient/appointments': json(200, []),
      'GET /api/patient/appointments/5': problem(404, 'La cita no existe', { code: 'NOT_FOUND' }),
    });
    await renderLoggedIn('Laura Gómez', '/paciente/citas/5');
    expect(await screen.findByText('No encontramos esta cita')).not.toBeNull();
    goTo('/paciente/citas');
  });
});
