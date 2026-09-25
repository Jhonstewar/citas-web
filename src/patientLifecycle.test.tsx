// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppointmentDetail } from './api/contracts';
import {
  appointmentDetail,
  installBackend,
  json,
  patientLifecycleScript,
  problem,
  renderLoggedIn,
  rescheduleRequest,
  sessionScript,
  SITE_HIC,
  SITE_ICV,
  SPECIALTY_CARDIO,
  type Call,
  type Script,
} from './test/fakeBackend';

/**
 * Ciclo de vida de la cita del paciente (S4): cancelar (HU-026), solicitar reprogramación
 * (HU-027) y decidir tras un rechazo (HU-028). El backend decide `cancellable`/`reschedulable` y
 * los errores; la UI los refleja.
 */

const RINCON = { id: 10, fullName: 'Andrés Rincón' };
const SITES = [
  { ...SITE_HIC, address: 'Km 7 vía Piedecuesta', city: 'Piedecuesta', department: 'Santander' },
  { ...SITE_ICV, address: 'Calle 155A', city: 'Floridablanca', department: 'Santander' },
];

function offer(site: typeof SITE_HIC, startTime: string, endTime: string) {
  return {
    professional: RINCON,
    site,
    specialty: SPECIALTY_CARDIO,
    date: '2026-09-22',
    startTime,
    endTime,
    durationMinutes: 60,
  };
}

function lifecycle(initial: AppointmentDetail, extra: Script = {}): Script {
  return {
    ...sessionScript('USER'),
    'GET /api/patient/appointments': json(200, []),
    'GET /api/catalogs/sites': json(200, SITES),
    'GET /api/patient/availability/days': json(200, [{ date: '2026-09-22', offers: 2 }]),
    'GET /api/patient/availability': json(200, [offer(SITE_HIC, '08:00', '09:00'), offer(SITE_ICV, '10:00', '11:00')]),
    ...patientLifecycleScript(initial),
    ...extra,
  };
}

async function openDetail(script: Script, id = 100): Promise<Call[]> {
  const calls = installBackend(script);
  await renderLoggedIn('Laura Gómez', `/paciente/citas/${id}`);
  await screen.findByRole('heading', { level: 1, name: 'Cardiología' });
  return calls;
}

function writes(calls: Call[]): Call[] {
  return calls.filter((call) => call.method !== 'GET' && !call.path.startsWith('/api/auth/'));
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
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('cancelar cita (HU-026)', () => {
  it('desde el detalle: diálogo accesible con datos, advertencia y motivo; éxito con toast', async () => {
    const calls = await openDetail(lifecycle(appointmentDetail()));

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar cita' }));

    const dialog = await screen.findByRole('alertdialog', { name: '¿Cancelar esta cita?' });
    // Foco inicial en la opción segura: un Enter accidental no cancela.
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'No, conservarla' }));
    expect(within(dialog).getByText(/Una cita cancelada no se puede reactivar/)).not.toBeNull();
    expect(within(dialog).getByText('Instituto del Corazón')).not.toBeNull();
    expect(within(dialog).queryByText(/solicitud de reprogramación pendiente/)).toBeNull();

    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: '  Viaje de trabajo  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar cita' }));

    expect(await screen.findByText('Cita cancelada')).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    const cancel = writes(calls).find((call) => call.path === '/api/patient/appointments/100/cancel');
    expect(cancel?.body).toEqual({ reason: 'Viaje de trabajo' });
    // La respuesta del servidor (CANCELLED) sustituye a la cita: ya no hay acciones.
    expect(screen.queryByRole('button', { name: 'Cancelar cita' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Solicitar reprogramación' })).toBeNull();
    expect(screen.getByText(/ya no admite cancelación ni reprogramación/)).not.toBeNull();
  });

  it('sin motivo no envía la clave `reason`', async () => {
    const calls = await openDetail(lifecycle(appointmentDetail()));
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar cita' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar cita' }));
    await screen.findByText('Cita cancelada');
    expect(writes(calls)[0]?.body).toEqual({});
  });

  it('con reprogramación PENDING avisa de que también se cancela (D18)', async () => {
    await openDetail(
      lifecycle(
        appointmentDetail({ pendingReschedule: true, reschedulable: false, lastReschedule: rescheduleRequest() }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar cita' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/solicitud de reprogramación pendiente/)).not.toBeNull();
  });

  it('409 APPOINTMENT_EXPIRED: muestra el motivo del servidor y recarga la cita', async () => {
    const initial = appointmentDetail();
    const started = { ...initial, cancellable: false, reschedulable: false };
    const calls = await openDetail(
      lifecycle(initial, {
        'GET /api/patient/appointments/100': [json(200, initial), json(200, started)],
        'POST /api/patient/appointments/100/cancel': problem(409, 'La cita ya empezó', {
          code: 'APPOINTMENT_EXPIRED',
        }),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar cita' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, cancelar cita' }));

    expect(await screen.findByText('La cita ya empezó')).not.toBeNull();
    expect(await screen.findByText(/ya llegó o pasó/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar cita' })).toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls.filter((call) => call.path === '/api/patient/appointments/100' && call.method === 'GET')).toHaveLength(2);
  });

  it('un 5xx deja el diálogo abierto con el error y permite reintentar', async () => {
    await openDetail(
      lifecycle(appointmentDetail(), {
        'POST /api/patient/appointments/100/cancel': problem(503, 'Servicio no disponible'),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar cita' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar cita' }));
    expect((await within(dialog).findByRole('alert')).textContent).toMatch(/servidor tuvo un problema/);
    expect((within(dialog).getByRole('button', { name: 'Sí, cancelar cita' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('400 del motivo: el error del servidor aparece en el campo', async () => {
    await openDetail(
      lifecycle(appointmentDetail(), {
        'POST /api/patient/appointments/100/cancel': problem(400, 'La petición contiene campos inválidos', {
          code: 'VALIDATION',
          fieldErrors: { reason: 'El motivo contiene caracteres no permitidos' },
        }),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar cita' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.change(within(dialog).getByLabelText(/Motivo/), { target: { value: 'x' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar cita' }));
    expect(await within(dialog).findByText('El motivo contiene caracteres no permitidos')).not.toBeNull();
    expect(within(dialog).getByLabelText(/Motivo/).getAttribute('aria-invalid')).toBe('true');
  });

  it('desde la próxima cita del inicio: cancela y recarga la lista', async () => {
    const item = appointmentDetail();
    const calls = installBackend({
      ...lifecycle(item),
      'GET /api/patient/appointments': [json(200, [item]), json(200, [])],
    });
    await renderLoggedIn('Laura Gómez');

    fireEvent.click(await screen.findByRole('button', { name: /Cancelar cita/ }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sí, cancelar cita' }));

    expect(await screen.findByText('No tienes citas próximas')).not.toBeNull();
    expect(writes(calls).map((call) => call.path)).toEqual(['/api/patient/appointments/100/cancel']);
  });

  it('el inicio no ofrece "Cancelar cita" si el listado la trae con cancellable = false (aclaración 8)', async () => {
    // Futura y APPROVED: por el estado parecería cancelable, pero decide el servidor.
    const item = appointmentDetail({ cancellable: false });
    installBackend({
      ...lifecycle(item),
      'GET /api/patient/appointments': json(200, [item]),
    });
    await renderLoggedIn('Laura Gómez');

    expect(await screen.findByText('Tienes 1 cita programada')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Cancelar cita/ })).toBeNull();
  });
});

describe('solicitar reprogramación (HU-027)', () => {
  it('el detalle ofrece la acción solo si la cita es reprogramable', async () => {
    await openDetail(lifecycle(appointmentDetail()));
    const link = screen.getByRole('link', { name: 'Solicitar reprogramación' });
    expect(link.getAttribute('href')).toBe('/paciente/citas/100/reprogramar');
  });

  it('éxito: busca con el profesional y la especialidad fijos, envía la franja y vuelve al detalle', async () => {
    const calls = installBackend(lifecycle(appointmentDetail()));
    await renderLoggedIn('Laura Gómez', '/paciente/citas/100/reprogramar');
    await screen.findByRole('heading', { level: 1, name: 'Solicitar reprogramación' });

    // Cita actual visible y datos fijos.
    expect(screen.getByText(/09:00 – 10:00 · Instituto del Corazón/)).not.toBeNull();
    expect(screen.getByText('Andrés Rincón')).not.toBeNull();

    const submit = screen.getByRole('button', { name: 'Solicitar reprogramación' });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(await screen.findByRole('button', { name: /08:00 a 09:00 con Andrés Rincón en Hospital/ }));
    fireEvent.change(screen.getByLabelText(/Motivo/), { target: { value: 'Me queda mejor temprano' } });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(submit);

    expect(await screen.findByRole('heading', { level: 1, name: 'Cardiología' })).not.toBeNull();
    expect(window.location.pathname).toBe('/paciente/citas/100');
    expect((await screen.findAllByText(/Reprogramación pendiente; tu cita actual sigue vigente/)).length).toBeGreaterThan(0);
    expect(screen.getByText('Solicitud de reprogramación enviada')).not.toBeNull();

    const search = calls.find((call) => call.path === '/api/patient/availability');
    expect(search?.query).toMatchObject({ specialtyId: '2', professionalId: '10' });
    const days = calls.find((call) => call.path === '/api/patient/availability/days');
    expect(days?.query).toMatchObject({ specialtyId: '2', professionalId: '10' });
    const request = writes(calls).find((call) => call.path.endsWith('/reschedule'));
    expect(request?.body).toEqual({
      siteId: 1,
      date: '2026-09-22',
      startTime: '08:00',
      reason: 'Me queda mejor temprano',
    });
    // Con la solicitud PENDING, el detalle ya no ofrece otra.
    expect(screen.queryByRole('link', { name: 'Solicitar reprogramación' })).toBeNull();
  });

  it('422 SAME_SLOT: muestra el mensaje del servidor y no sale de la pantalla', async () => {
    installBackend(
      lifecycle(appointmentDetail(), {
        'POST /api/patient/appointments/100/reschedule': problem(422, 'La franja propuesta es la misma que la actual', {
          code: 'SAME_SLOT',
        }),
      }),
    );
    await renderLoggedIn('Laura Gómez', '/paciente/citas/100/reprogramar');
    fireEvent.click(await screen.findByRole('button', { name: /10:00 a 11:00 con Andrés Rincón en Instituto/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar reprogramación' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/La franja propuesta es la misma que la actual/);
    expect(window.location.pathname).toBe('/paciente/citas/100/reprogramar');
    // La franja rechazada se deselecciona: hay que elegir otra.
    expect((screen.getByRole('button', { name: 'Solicitar reprogramación' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('409 SLOT_TAKEN: recarga los horarios y pide elegir otra franja', async () => {
    const calls = installBackend(
      lifecycle(appointmentDetail(), {
        'POST /api/patient/appointments/100/reschedule': problem(409, 'La franja ya fue tomada', { code: 'SLOT_TAKEN' }),
      }),
    );
    await renderLoggedIn('Laura Gómez', '/paciente/citas/100/reprogramar');
    fireEvent.click(await screen.findByRole('button', { name: /08:00 a 09:00/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar reprogramación' }));

    expect(await screen.findByText(/Esa franja ya no está disponible/)).not.toBeNull();
    await waitFor(() =>
      expect(calls.filter((call) => call.path === '/api/patient/availability').length).toBeGreaterThan(1),
    );
  });

  it('409 RESCHEDULE_PENDING: recarga la cita y la muestra como no elegible', async () => {
    const initial = appointmentDetail();
    installBackend(
      lifecycle(initial, {
        'GET /api/patient/appointments/100': [
          json(200, initial),
          json(200, { ...initial, pendingReschedule: true, reschedulable: false }),
        ],
        'POST /api/patient/appointments/100/reschedule': problem(409, 'La cita ya tiene una reprogramación pendiente', {
          code: 'RESCHEDULE_PENDING',
        }),
      }),
    );
    await renderLoggedIn('Laura Gómez', '/paciente/citas/100/reprogramar');
    fireEvent.click(await screen.findByRole('button', { name: /08:00 a 09:00/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Solicitar reprogramación' }));

    expect(await screen.findByText('Esta cita no se puede reprogramar')).not.toBeNull();
    expect(screen.getByText(/La cita ya tiene una reprogramación pendiente/)).not.toBeNull();
  });

  it('no elegible: explica el motivo en vez de ofrecer el selector', async () => {
    const calls = installBackend(
      lifecycle(appointmentDetail({ status: 'REQUESTED', statusName: 'Solicitada', reschedulable: false })),
    );
    await renderLoggedIn('Laura Gómez', '/paciente/citas/100/reprogramar');

    expect(await screen.findByText('Esta cita no se puede reprogramar')).not.toBeNull();
    expect(screen.getByText(/Solo se reprograma una cita aprobada/)).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Volver al detalle' }).getAttribute('href')).toBe('/paciente/citas/100');
    expect(calls.some((call) => call.path.startsWith('/api/patient/availability'))).toBe(false);
  });
});

describe('estado de la reprogramación en el detalle y en Mis citas (HU-028)', () => {
  const rejected = () =>
    appointmentDetail({
      lastReschedule: rescheduleRequest({
        status: 'REJECTED',
        statusName: 'Rechazada',
        decisionReason: 'El profesional no atiende ese día',
        decidedAt: '2099-09-26T10:00:00',
      }),
    });

  it('PENDING: muestra la franja propuesta y que la cita actual sigue vigente', async () => {
    await openDetail(
      lifecycle(appointmentDetail({ pendingReschedule: true, reschedulable: false, lastReschedule: rescheduleRequest() })),
    );
    const notice = screen.getByRole('region', { name: 'Reprogramación pendiente' });
    expect(within(notice).getByText(/tu cita actual sigue vigente/)).not.toBeNull();
    expect(within(notice).getByText(/Hospital Internacional de Colombia/)).not.toBeNull();
    expect(screen.getByText(/Ya tienes una solicitud de reprogramación pendiente/)).not.toBeNull();
  });

  it('REJECTED + conservar: cierra el aviso sin escribir en la API y lo recuerda en la sesión', async () => {
    const calls = await openDetail(lifecycle(rejected()));

    const notice = screen.getByRole('region', { name: 'Tu solicitud de reprogramación fue rechazada.' });
    expect(within(notice).getByText('El profesional no atiende ese día')).not.toBeNull();
    expect(within(notice).getByText(/Hospital Internacional de Colombia/)).not.toBeNull();
    expect(within(notice).getByText(/Instituto del Corazón/)).not.toBeNull();

    fireEvent.click(within(notice).getByRole('button', { name: 'Conservar mi cita' }));

    expect(screen.queryByRole('region', { name: 'Tu solicitud de reprogramación fue rechazada.' })).toBeNull();
    // El rechazo sigue visible como información (CA-01), sin botones de decisión.
    expect(screen.getByText(/fue rechazada: El profesional no atiende ese día/)).not.toBeNull();
    expect(writes(calls)).toEqual([]);
    expect(window.sessionStorage.getItem('citas.reschedule-rejection-kept.500')).toBe('1');
  });

  it('REJECTED + cancelar: reutiliza el diálogo de cancelación', async () => {
    const calls = await openDetail(lifecycle(rejected()));
    const notice = screen.getByRole('region', { name: 'Tu solicitud de reprogramación fue rechazada.' });
    // El botón de cancelar no se duplica en la tarjeta de acciones.
    expect(screen.getAllByRole('button', { name: 'Cancelar cita' })).toHaveLength(1);

    fireEvent.click(within(notice).getByRole('button', { name: 'Cancelar cita' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Sí, cancelar cita' }));

    expect(await screen.findByText('Cita cancelada')).not.toBeNull();
    expect(writes(calls).map((call) => call.path)).toEqual(['/api/patient/appointments/100/cancel']);
    expect(screen.queryByRole('region', { name: 'Tu solicitud de reprogramación fue rechazada.' })).toBeNull();
  });

  it('APPROVED: informa de la franja anterior', async () => {
    await openDetail(
      lifecycle(
        appointmentDetail({
          lastReschedule: rescheduleRequest({ status: 'APPROVED', statusName: 'Aprobada' }),
        }),
      ),
    );
    expect(screen.getByText('Reprogramada desde')).not.toBeNull();
  });

  it('Mis citas marca las citas con reprogramación pendiente', async () => {
    installBackend({
      ...lifecycle(appointmentDetail()),
      'GET /api/catalogs/appointment-statuses': json(200, []),
      'GET /api/patient/appointments': json(200, [
        appointmentDetail({ pendingReschedule: true }),
        appointmentDetail({ id: 101, pendingReschedule: false }),
      ]),
    });
    await renderLoggedIn('Laura Gómez', '/paciente/citas');
    await screen.findByRole('heading', { level: 1, name: 'Mis citas' });
    await waitFor(() => expect(screen.getAllByText('Reprogramación pendiente')).toHaveLength(1));
  });
});
