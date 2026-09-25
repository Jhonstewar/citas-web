// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InboxEntry } from './api/contracts';
import {
  REGIMES,
  SITE_HIC,
  SITE_ICV,
  adminAppointment,
  adminRescheduleScript,
  eps,
  epsAdminScript,
  epsPlan,
  installBackend,
  json,
  problem,
  renderLoggedIn,
  rescheduleRequest,
  sessionScript,
  timeSlot,
  type Call,
  type Script,
} from './test/fakeBackend';

/**
 * Pantallas de S4 del ADMIN: bandeja con reprogramaciones (HU-029, HU-031), contador del panel
 * y CRUD de EPS y planes (HU-012).
 */

const SITES = [
  { ...SITE_HIC, address: 'Km 7 vía Piedecuesta', city: 'Floridablanca', department: 'Santander' },
  { ...SITE_ICV, address: 'Calle 155A', city: 'Floridablanca', department: 'Santander' },
];

const SUMMARY = {
  pendingRequests: 1,
  activeProfessionals: 1,
  activeSpecialties: 2,
  appointmentsToday: 0,
  pendingReschedules: 4,
};

function adminScript(extra: Script = {}): Script {
  return {
    ...sessionScript('ADMIN'),
    'GET /api/admin/summary': json(200, SUMMARY),
    'GET /api/catalogs/sites': json(200, SITES),
    'GET /api/admin/professionals': json(200, []),
    'GET /api/admin/specialties': json(200, []),
    ...extra,
  };
}

async function openAs(path: string, script: Script, heading: string): Promise<Call[]> {
  const calls = installBackend(script);
  await renderLoggedIn('Marta Ruiz', path);
  await screen.findByRole('heading', { name: heading, level: 1 });
  return calls;
}

/** Solicitud especializada de Pedro Díaz. */
const REQUEST_ENTRY: InboxEntry = {
  type: 'APPOINTMENT_REQUEST',
  appointment: adminAppointment({
    id: 101,
    status: 'REQUESTED',
    statusName: 'Solicitada',
    patient: { id: 6, fullName: 'Pedro Díaz', documentType: 'CC', documentNumber: '222', email: 'p@fcv.test' },
  }),
};

/** Reprogramación de Laura Gómez: del 1 de octubre en ICV al 8 de octubre en HIC. */
const RESCHEDULE_ENTRY: InboxEntry = {
  type: 'RESCHEDULE_REQUEST',
  appointment: adminAppointment({ pendingReschedule: true }),
  reschedule: rescheduleRequest({
    previous: timeSlot(),
    proposed: timeSlot({ date: '2099-10-08', startTime: '11:00', endTime: '12:00', site: SITE_HIC }),
    requestReason: 'Tengo un viaje ese día',
  }),
};

function inboxCalls(calls: Call[]): Call[] {
  return calls.filter((call) => call.path === '/api/admin/inbox');
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

/* -------------------------------------------------------------------------- */

describe('bandeja con reprogramaciones (HU-029, HU-031)', () => {
  it('muestra la franja actual → propuesta, solicitante, profesional, especialidad y motivo', async () => {
    await openAs(
      '/admin/solicitudes',
      adminScript(adminRescheduleScript([REQUEST_ENTRY, RESCHEDULE_ENTRY])),
      'Solicitudes pendientes',
    );

    const table = await screen.findByRole('table', { name: 'Solicitudes pendientes' });
    const row = within(table).getByText('Laura Gómez').closest('tr') as HTMLElement;
    expect(within(row).getByText('Reprogramación')).not.toBeNull();
    expect(within(row).getByText('Motivo: Tengo un viaje ese día')).not.toBeNull();
    expect(within(row).getByText('Cardiología')).not.toBeNull();
    expect(within(row).getByText('Andrés Rincón')).not.toBeNull();
    expect(within(row).getByText('Actual')).not.toBeNull();
    expect(within(row).getByText('Propuesta')).not.toBeNull();
    expect(within(row).getByText('09:00 – 10:00')).not.toBeNull();
    expect(within(row).getByText('11:00 – 12:00')).not.toBeNull();
    expect(within(row).getByText('Instituto del Corazón')).not.toBeNull();
    // Cada entrada indica su tipo (HU-029 CA-01).
    const other = within(table).getByText('Pedro Díaz').closest('tr') as HTMLElement;
    expect(within(other).getByText('Cita especializada')).not.toBeNull();
  });

  it('aprobar pide confirmación mostrando el cambio; la reprogramación sale de la bandeja', async () => {
    const calls = await openAs(
      '/admin/solicitudes',
      adminScript(adminRescheduleScript([REQUEST_ENTRY, RESCHEDULE_ENTRY])),
      'Solicitudes pendientes',
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar reprogramación de Laura Gómez' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Aprobar esta reprogramación?' });
    expect(within(dialog).getByText('Actual')).not.toBeNull();
    expect(within(dialog).getByText('11:00 – 12:00')).not.toBeNull();
    expect(calls.some((call) => call.path.startsWith('/api/admin/reschedules'))).toBe(false);

    fireEvent.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByText('Reprogramación aprobada')).not.toBeNull();
    expect(screen.queryByText('Laura Gómez')).toBeNull();
    expect(screen.getByText('Pedro Díaz')).not.toBeNull();
    expect(calls.filter((call) => call.path === '/api/admin/reschedules/500/approve')).toHaveLength(1);
  });

  it('rechazar exige motivo: sin él no se envía; con él se envía recortado', async () => {
    const calls = await openAs(
      '/admin/solicitudes',
      adminScript(adminRescheduleScript([RESCHEDULE_ENTRY])),
      'Solicitudes pendientes',
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar reprogramación de Laura Gómez' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rechazar reprogramación' });
    const reason = within(dialog).getByLabelText(/Motivo del rechazo/);
    expect(document.activeElement).toBe(reason);
    const confirm = within(dialog).getByRole('button', { name: 'Rechazar reprogramación' });
    expect(confirm.hasAttribute('disabled')).toBe(true);

    // Un envío forzado del formulario sin motivo tampoco llama a la API.
    fireEvent.submit(reason.closest('form') as HTMLFormElement);
    expect(await within(dialog).findByText('Escribe el motivo del rechazo.')).not.toBeNull();
    expect(calls.some((call) => call.path.endsWith('/reject'))).toBe(false);

    fireEvent.change(reason, { target: { value: '  La franja propuesta ya no está disponible  ' } });
    fireEvent.click(confirm);

    expect(await screen.findByText('Reprogramación rechazada')).not.toBeNull();
    expect(calls.find((call) => call.path === '/api/admin/reschedules/500/reject')?.body).toEqual({
      reason: 'La franja propuesta ya no está disponible',
    });
    expect(await screen.findByText('¡Todo al día! No hay solicitudes pendientes')).not.toBeNull();
  });

  it('el filtro "Tipo" viaja como `type` y el panel abre la bandeja ya filtrada', async () => {
    const calls = await openAs(
      '/admin',
      adminScript(adminRescheduleScript([REQUEST_ENTRY, RESCHEDULE_ENTRY])),
      'Panel',
    );

    const counter = await screen.findByRole('link', { name: /Reprogramaciones pendientes/ });
    expect(within(counter).getByText('4')).not.toBeNull();
    fireEvent.click(counter);

    await screen.findByRole('heading', { name: 'Solicitudes pendientes', level: 1 });
    expect((screen.getByLabelText('Tipo') as HTMLSelectElement).value).toBe('RESCHEDULE_REQUEST');
    await screen.findByText('Laura Gómez');
    expect(screen.queryByText('Pedro Díaz')).toBeNull();
    expect(inboxCalls(calls).at(-1)?.query).toEqual({ type: 'RESCHEDULE_REQUEST' });

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'APPOINTMENT_REQUEST' } });
    expect(await screen.findByText('Pedro Díaz')).not.toBeNull();
    expect(screen.queryByText('Laura Gómez')).toBeNull();
    expect(inboxCalls(calls).at(-1)?.query).toEqual({ type: 'APPOINTMENT_REQUEST' });

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: '' } });
    await waitFor(() => expect(inboxCalls(calls).at(-1)?.query).toEqual({}));
  });

  it('un 409 al aprobar (CONCURRENT_CHANGE) informa con el mensaje del servidor y recarga', async () => {
    const calls = await openAs(
      '/admin/solicitudes',
      adminScript({
        'GET /api/admin/inbox': [json(200, [RESCHEDULE_ENTRY]), json(200, [])],
        'POST /api/admin/reschedules/500/approve': problem(409, 'Otra operación cambió la cita; vuelve a intentarlo', {
          code: 'CONCURRENT_CHANGE',
        }),
      }),
      'Solicitudes pendientes',
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar reprogramación de Laura Gómez' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByText('Otra operación cambió la cita; vuelve a intentarlo')).not.toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => expect(inboxCalls(calls)).toHaveLength(2));
  });
});

/* -------------------------------------------------------------------------- */

describe('EPS (HU-012)', () => {
  it('crea una EPS con código normalizado; queda activa en el listado', async () => {
    const calls = await openAs('/admin/eps', adminScript(epsAdminScript([eps()])), 'EPS y planes');
    await screen.findByText('EPS de prueba');

    fireEvent.click(screen.getByRole('button', { name: 'Nueva EPS' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva EPS' });
    // Validación de cliente: sin datos no se llama a la API.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear EPS' }));
    expect(await within(dialog).findByText('Escribe el nombre de la EPS.')).not.toBeNull();

    fireEvent.change(within(dialog).getByLabelText(/^Código/), { target: { value: 'eps salud demo' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nombre/), { target: { value: 'Salud Demo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear EPS' }));

    expect(await screen.findByText('EPS creada')).not.toBeNull();
    const posts = calls.filter((call) => call.method === 'POST' && call.path === '/api/admin/eps');
    expect(posts).toHaveLength(1);
    expect(posts[0]?.body).toEqual({ code: 'EPS_SALUD_DEMO', name: 'Salud Demo' });
    const row = within(screen.getByRole('table')).getByText('Salud Demo').closest('tr') as HTMLElement;
    expect(within(row).getByText('Activa')).not.toBeNull();
    expect(within(row).getByText('0 planes')).not.toBeNull();
  });

  it('un 409 DUPLICATE marca el campo que indica `field`', async () => {
    await openAs('/admin/eps', adminScript(epsAdminScript([eps()])), 'EPS y planes');
    await screen.findByText('EPS de prueba');

    fireEvent.click(screen.getByRole('button', { name: 'Nueva EPS' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva EPS' });
    fireEvent.change(within(dialog).getByLabelText(/^Código/), { target: { value: 'OTRA' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nombre/), { target: { value: 'EPS de prueba' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear EPS' }));

    expect(await within(dialog).findByText('Ya existe un registro con ese nombre')).not.toBeNull();
    expect(within(dialog).getByLabelText(/^Nombre/).getAttribute('aria-invalid')).toBe('true');
    expect(within(dialog).getByLabelText(/^Código/).getAttribute('aria-invalid')).toBe('false');
  });

  it('una EPS con planes no se borra: 409 EPS_REFERENCED ofrece desactivarla', async () => {
    const calls = await openAs(
      '/admin/eps',
      adminScript(epsAdminScript([eps()], [epsPlan()])),
      'EPS y planes',
    );

    const row = (await screen.findByText('EPS de prueba')).closest('tr') as HTMLElement;
    expect(within(row).getByText('1 plan')).not.toBeNull();
    fireEvent.click(within(row).getByRole('button', { name: 'Eliminar EPS de prueba' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Eliminar esta EPS?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByText('Tiene planes: desactívala en lugar de borrarla.')).not.toBeNull();
    expect(within(dialog).getByText('La EPS tiene planes: desactívala en su lugar')).not.toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Eliminar' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar en su lugar' }));

    expect(await screen.findByText('EPS desactivada')).not.toBeNull();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ active: false });
    const updated = within(screen.getByRole('table')).getByText('EPS de prueba').closest('tr') as HTMLElement;
    expect(within(updated).getByText('Inactiva')).not.toBeNull();
  });

  it('edita solo el nombre: el código no se envía ni se edita', async () => {
    const calls = await openAs('/admin/eps', adminScript(epsAdminScript([eps()])), 'EPS y planes');

    fireEvent.click(await screen.findByRole('button', { name: 'Editar EPS de prueba' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar EPS' });
    expect(within(dialog).queryByLabelText(/^Código/)).toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Nombre/), { target: { value: 'EPS renombrada' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('EPS actualizada')).not.toBeNull();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ name: 'EPS renombrada' });
  });
});

describe('planes de una EPS (HU-012)', () => {
  function plansScript(referenced: number[] = []): Script {
    return adminScript({
      'GET /api/catalogs/regimes': json(200, REGIMES),
      ...epsAdminScript([eps()], [epsPlan()], referenced),
    });
  }

  it('crea un plan con régimen del catálogo; sin régimen no se envía', async () => {
    const calls = await openAs('/admin/eps/1', plansScript(), 'EPS de prueba');
    await screen.findByText('Plan básico');

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo plan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo plan' });
    fireEvent.change(within(dialog).getByLabelText(/^Código/), { target: { value: 'subsidiado basico' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nombre/), { target: { value: 'Subsidiado básico' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear plan' }));
    expect(await within(dialog).findByText('Elige el régimen del plan.')).not.toBeNull();
    expect(calls.some((call) => call.method === 'POST' && call.path.startsWith('/api/admin/eps'))).toBe(false);

    const regime = within(dialog).getByLabelText(/^Régimen/);
    expect(within(regime).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Elige un régimen',
      'Régimen contributivo',
      'Régimen subsidiado',
    ]);
    fireEvent.change(regime, { target: { value: 'SUBSIDIADO' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear plan' }));

    expect(await screen.findByText('Plan creado')).not.toBeNull();
    expect(calls.find((call) => call.method === 'POST' && call.path === '/api/admin/eps/1/plans')?.body).toEqual({
      code: 'SUBSIDIADO_BASICO',
      name: 'Subsidiado básico',
      regimeCode: 'SUBSIDIADO',
    });
    const row = within(screen.getByRole('table')).getByText('Subsidiado básico').closest('tr') as HTMLElement;
    expect(within(row).getByText('Régimen subsidiado')).not.toBeNull();
    expect(within(row).getByText('Activo')).not.toBeNull();
  });

  it('un código de plan repetido en la EPS marca el campo Código', async () => {
    await openAs('/admin/eps/1', plansScript(), 'EPS de prueba');
    await screen.findByText('Plan básico');

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo plan' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo plan' });
    fireEvent.change(within(dialog).getByLabelText(/^Código/), { target: { value: 'CONTRIB_BASICO' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nombre/), { target: { value: 'Otro plan' } });
    fireEvent.change(within(dialog).getByLabelText(/^Régimen/), { target: { value: 'CONTRIBUTIVO' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear plan' }));

    expect(await within(dialog).findByText('Ya existe un registro con ese código')).not.toBeNull();
    expect(within(dialog).getByLabelText(/^Código/).getAttribute('aria-invalid')).toBe('true');
  });

  it('un plan con afiliaciones no se borra: 409 PLAN_REFERENCED ofrece desactivarlo', async () => {
    const calls = await openAs('/admin/eps/1', plansScript([3]), 'EPS de prueba');

    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar plan Plan básico' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Eliminar este plan?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByText('Tiene afiliaciones: desactívalo en lugar de borrarlo.')).not.toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar en su lugar' }));

    expect(await screen.findByText('Plan desactivado')).not.toBeNull();
    expect(calls.find((call) => call.method === 'PATCH')?.path).toBe('/api/admin/eps-plans/3/status');
    const updated = within(screen.getByRole('table')).getByText('Plan básico').closest('tr') as HTMLElement;
    expect(within(updated).getByText('Inactivo')).not.toBeNull();
  });

  it('edita nombre y régimen; el código queda de solo lectura', async () => {
    const calls = await openAs('/admin/eps/1', plansScript(), 'EPS de prueba');

    fireEvent.click(await screen.findByRole('button', { name: 'Editar plan Plan básico' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar plan' });
    expect(within(dialog).queryByLabelText(/^Código/)).toBeNull();
    expect((within(dialog).getByLabelText(/^Régimen/) as HTMLSelectElement).value).toBe('CONTRIBUTIVO');
    fireEvent.change(within(dialog).getByLabelText(/^Régimen/), { target: { value: 'SUBSIDIADO' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Plan actualizado')).not.toBeNull();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      name: 'Plan básico',
      regimeCode: 'SUBSIDIADO',
    });
  });

  it('pide la EPS por id (aclaración 9), no el listado completo', async () => {
    const calls = await openAs('/admin/eps/1', plansScript(), 'EPS de prueba');
    await screen.findByText('Plan básico');

    const gets = calls.filter((call) => call.method === 'GET').map((call) => call.path);
    expect(gets).toContain('/api/admin/eps/1');
    expect(gets).not.toContain('/api/admin/eps');
  });

  it('una EPS inexistente (404 del servidor) muestra "No encontramos esta EPS"', async () => {
    const calls = await openAs('/admin/eps/999', plansScript(), 'Planes de la EPS');
    expect(await screen.findByText('No encontramos esta EPS')).not.toBeNull();
    expect(calls.some((call) => call.method === 'GET' && call.path === '/api/admin/eps/999')).toBe(true);
    // Un 404 no ofrece reintentar: el recurso no existe.
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });

  it('un id no numérico no se pide al backend', async () => {
    const calls = await openAs('/admin/eps/abc', plansScript(), 'Planes de la EPS');
    expect(await screen.findByText('No encontramos esta EPS')).not.toBeNull();
    expect(calls.some((call) => call.path.startsWith('/api/admin/eps'))).toBe(false);
  });
});
