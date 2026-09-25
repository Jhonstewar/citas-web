// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SITE_HIC,
  SITE_ICV,
  installBackend,
  json,
  problem,
  professionalAppointment,
  professionalAppointmentsScript,
  renderLoggedIn,
  sessionScript,
  type Call,
  type Script,
} from './test/fakeBackend';

/**
 * Pestaña "Citas" de la agenda del profesional (HU-020, HU-021): lista de citas APPROVED por día
 * o semana (lunes a domingo, D35) y sede, cierre como atendida / no asistió con confirmación,
 * cita todavía no cerrable con el motivo visible y 409 con aviso y recarga.
 */

const PROFILE = {
  id: 3,
  userId: 7,
  firstNames: 'Andrés',
  lastNames: 'Rincón',
  fullName: 'Andrés Rincón',
  documentType: 'CC',
  documentNumber: '2002',
  email: 'andres@fcv.test',
  phone: '3000000000',
  professionalCode: 'PRO-1',
  licenseNumber: 'MP-1',
  active: true,
  specialties: [],
  sites: [SITE_HIC, SITE_ICV],
};

// Lunes 21 de septiembre de 2026, 08:00 en Bogotá.
const TODAY = '2026-09-21';

const STARTED = professionalAppointment({
  id: 100,
  date: TODAY,
  startTime: '07:00',
  endTime: '08:00',
  site: SITE_ICV,
  closable: true,
});
const LATER = professionalAppointment({
  id: 101,
  date: TODAY,
  startTime: '09:00',
  endTime: '10:00',
  site: SITE_HIC,
  closable: false,
  patient: { fullName: 'Pedro Díaz', documentType: 'CE', documentNumber: '555' },
});
const THURSDAY = professionalAppointment({
  id: 102,
  date: '2026-09-24',
  startTime: '10:00',
  endTime: '11:00',
  site: SITE_HIC,
  closable: false,
  patient: { fullName: 'Ana Ruiz', documentType: 'CC', documentNumber: '777' },
});

function agendaScript(extra: Script = {}): Script {
  return {
    ...sessionScript('PROFESSIONAL'),
    'GET /api/professional/me': json(200, PROFILE),
    'GET /api/professional/blocks': json(200, []),
    ...extra,
  };
}

function appointmentCalls(calls: Call[]): Call[] {
  return calls.filter((call) => call.method === 'GET' && call.path === '/api/professional/appointments');
}

async function openAppointments(script: Script): Promise<Call[]> {
  const calls = installBackend(script);
  await renderLoggedIn('Andrés Rincón', '/profesional/agenda');
  await screen.findByRole('heading', { name: 'Mi agenda', level: 1 });
  fireEvent.click(screen.getByRole('tab', { name: 'Citas' }));
  return calls;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-21T13:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('pestañas de la agenda', () => {
  it('"Bloques" sigue siendo la vista inicial y "Citas" se abre desde el inicio con "Ver mis citas de hoy"', async () => {
    const calls = installBackend(agendaScript(professionalAppointmentsScript([STARTED])));
    await renderLoggedIn('Andrés Rincón');

    fireEvent.click(await screen.findByRole('link', { name: 'Ver mis citas de hoy' }));

    const tab = await screen.findByRole('tab', { name: 'Citas' });
    expect(tab.getAttribute('aria-selected')).toBe('true');
    expect(await screen.findByRole('article', { name: /Cita de Laura Gómez/ })).not.toBeNull();
    expect(appointmentCalls(calls).at(-1)?.query).toEqual({ from: TODAY, to: TODAY });

    // Volver a "Bloques" muestra la vista de S3 con su acción.
    fireEvent.click(screen.getByRole('tab', { name: 'Bloques' }));
    expect(await screen.findByText('No tienes bloques esta semana')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Nuevo bloque' })).not.toBeNull();
  });
});

describe('lista de citas aprobadas (HU-020)', () => {
  it('muestra hora, duración, especialidad, sede y paciente; cambia a semana (lunes a domingo) y filtra por sede', async () => {
    const calls = await openAppointments(
      agendaScript(professionalAppointmentsScript([STARTED, LATER, THURSDAY])),
    );

    const card = await screen.findByRole('article', { name: /Cita de Pedro Díaz de las 09:00/ });
    expect(within(card).getByText('Cardiología')).not.toBeNull();
    expect(within(card).getByText(/09:00 – 10:00/)).not.toBeNull();
    expect(within(card).getByText('60 min')).not.toBeNull();
    expect(within(card).getByText('Hospital Internacional de Colombia')).not.toBeNull();
    expect(within(card).getByText('Pedro Díaz')).not.toBeNull();
    expect(within(card).getByText('CE 555')).not.toBeNull();
    // Solo las del día.
    expect(screen.queryByRole('article', { name: /Ana Ruiz/ })).toBeNull();

    fireEvent.click(screen.getByRole('radio', { name: 'Semana' }));
    expect(await screen.findByRole('article', { name: /Cita de Ana Ruiz/ })).not.toBeNull();
    expect(appointmentCalls(calls).at(-1)?.query).toEqual({ from: TODAY, to: '2026-09-27' });

    fireEvent.change(screen.getByLabelText('Sede'), { target: { value: String(SITE_HIC.id) } });
    await waitFor(() => {
      expect(appointmentCalls(calls).at(-1)?.query).toEqual({
        from: TODAY,
        to: '2026-09-27',
        siteId: String(SITE_HIC.id),
      });
    });
    await waitFor(() => expect(screen.queryByRole('article', { name: /Laura Gómez/ })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: /Semana siguiente/ }));
    expect(await screen.findByText('No tienes citas aprobadas en este periodo')).not.toBeNull();
    expect(appointmentCalls(calls).at(-1)?.query).toEqual({
      from: '2026-09-28',
      to: '2026-10-04',
      siteId: String(SITE_HIC.id),
    });
  });

  it('un día sin citas muestra el estado vacío, no un error (HU-020 CA-07)', async () => {
    await openAppointments(agendaScript(professionalAppointmentsScript([])));
    expect(await screen.findByText('No tienes citas aprobadas en este periodo')).not.toBeNull();
  });
});

describe('cierre de la atención (HU-021)', () => {
  it('marca como atendida tras confirmar; la cita sale de la lista con un aviso', async () => {
    const calls = await openAppointments(agendaScript(professionalAppointmentsScript([STARTED])));

    fireEvent.click(
      await screen.findByRole('button', { name: /Marcar como atendida la cita de Laura Gómez/ }),
    );
    const dialog = await screen.findByRole('alertdialog', { name: '¿Marcar la cita como atendida?' });
    // El foco inicial va a "Cancelar" y sin confirmar no se llama a la API.
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(calls.some((call) => call.method === 'POST' && call.path.startsWith('/api/professional'))).toBe(false);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Marcar como atendida' }));

    expect(await screen.findByText('Cita marcada como atendida')).not.toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.queryByRole('article', { name: /Laura Gómez/ })).toBeNull();
    expect(screen.getByText('No tienes citas aprobadas en este periodo')).not.toBeNull();
    expect(
      calls.filter((call) => call.method === 'POST' && call.path === '/api/professional/appointments/100/complete'),
    ).toHaveLength(1);
  });

  it('registra la inasistencia con la acción "No asistió"', async () => {
    const calls = await openAppointments(agendaScript(professionalAppointmentsScript([STARTED])));

    fireEvent.click(
      await screen.findByRole('button', { name: /Registrar inasistencia a la cita de Laura Gómez/ }),
    );
    const dialog = await screen.findByRole('alertdialog', { name: '¿Registrar inasistencia?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar inasistencia' }));

    expect(await screen.findByText('Inasistencia registrada')).not.toBeNull();
    expect(calls.some((call) => call.path === '/api/professional/appointments/100/no-show')).toBe(true);
  });

  it('una cita que aún no empezó tiene los botones deshabilitados con el motivo visible', async () => {
    await openAppointments(agendaScript(professionalAppointmentsScript([LATER])));

    const card = await screen.findByRole('article', { name: /Cita de Pedro Díaz/ });
    const reason = within(card).getByText('Disponible desde las 09:00');
    const attended = within(card).getByRole('button', { name: /Marcar como atendida/ });
    const noShow = within(card).getByRole('button', { name: /Registrar inasistencia/ });
    expect(attended.hasAttribute('disabled')).toBe(true);
    expect(noShow.hasAttribute('disabled')).toBe(true);
    // El motivo describe a los botones para los lectores de pantalla.
    expect(attended.getAttribute('aria-describedby')).toBe(reason.id);
  });

  it('un 409 al cerrar (APPOINTMENT_NOT_STARTED) avisa con el mensaje del servidor y recarga la lista', async () => {
    const calls = await openAppointments(
      agendaScript({
        'GET /api/professional/appointments': [json(200, [STARTED]), json(200, [{ ...STARTED, closable: false }])],
        'POST /api/professional/appointments/100/complete': problem(409, 'La cita todavía no ha empezado', {
          code: 'APPOINTMENT_NOT_STARTED',
        }),
      }),
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /Marcar como atendida la cita de Laura Gómez/ }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Marcar como atendida' }),
    );

    expect(await screen.findByText('La cita todavía no ha empezado')).not.toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(appointmentCalls(calls)).toHaveLength(2));
    expect(await screen.findByText('Disponible desde las 07:00')).not.toBeNull();
  });

  it('un 409 INVALID_TRANSITION (otro actor ya la cerró) también avisa y recarga', async () => {
    const calls = await openAppointments(
      agendaScript({
        'GET /api/professional/appointments': [json(200, [STARTED]), json(200, [])],
        'POST /api/professional/appointments/100/no-show': problem(409, 'La cita ya no está aprobada', {
          code: 'INVALID_TRANSITION',
        }),
      }),
    );

    fireEvent.click(
      await screen.findByRole('button', { name: /Registrar inasistencia a la cita de Laura Gómez/ }),
    );
    fireEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Registrar inasistencia' }),
    );

    expect(await screen.findByText('La cita ya no está aprobada')).not.toBeNull();
    await waitFor(() => expect(appointmentCalls(calls)).toHaveLength(2));
    expect(await screen.findByText('No tienes citas aprobadas en este periodo')).not.toBeNull();
  });
});
