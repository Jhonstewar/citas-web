// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installBackend,
  json,
  problem,
  renderLoggedIn,
  sessionScript,
  type Call,
  type Script,
} from './test/fakeBackend';

/**
 * Operación del ADMIN: bandeja con aprobar/rechazar (HU-029, HU-030), especialidades con duración
 * 30/60 y borrado protegido (HU-011) y profesionales (HU-013..016).
 */

const HIC = { id: 1, code: 'HIC', name: 'Hospital Internacional de Colombia' };
const ICV = { id: 2, code: 'ICV', name: 'Instituto del Corazón' };
const SITES = [
  { ...HIC, address: 'Km 7 vía Piedecuesta', city: 'Floridablanca', department: 'Santander' },
  { ...ICV, address: 'Calle 155A', city: 'Floridablanca', department: 'Santander' },
];
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

function request(id: number, patient: string) {
  return {
    type: 'APPOINTMENT_REQUEST',
    appointment: {
      id,
      status: 'REQUESTED',
      statusName: 'Solicitada',
      date: '2099-09-22',
      startTime: '09:00',
      endTime: '10:00',
      durationMinutes: 60,
      site: ICV,
      professional: { id: 10, fullName: 'Andrés Rincón' },
      specialty: { id: 2, code: 'CARDIOLOGIA', name: 'Cardiología', appointmentType: 'SPECIALIZED', durationMinutes: 60 },
      rejectionReason: null,
      createdAt: '2099-09-20T10:00:00',
      history: [],
      patient: { id: 5, fullName: patient, documentType: 'CC', documentNumber: '123', email: 'p@fcv.test', phone: '300' },
    },
  };
}

const PROFESSIONAL = {
  id: 10,
  userId: 20,
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
  specialties: [{ id: 2, code: 'CARDIOLOGIA', name: 'Cardiología', appointmentType: 'SPECIALIZED', durationMinutes: 60, primary: true }],
  sites: [ICV],
};

function adminScript(extra: Script = {}): Script {
  return {
    ...sessionScript('ADMIN'),
    'GET /api/admin/summary': json(200, { pendingRequests: 2, activeProfessionals: 1, activeSpecialties: 2, appointmentsToday: 0 }),
    'GET /api/catalogs/sites': json(200, SITES),
    'GET /api/admin/professionals': json(200, [PROFESSIONAL]),
    'GET /api/admin/specialties': json(200, [GENERAL, CARDIO]),
    ...extra,
  };
}

async function openAs(path: string, script: Script, heading: string): Promise<Call[]> {
  const calls = installBackend(script);
  await renderLoggedIn('Marta Ruiz', path);
  await screen.findByRole('heading', { name: heading, level: 1 });
  return calls;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('bandeja de solicitudes', () => {
  it('muestra los datos para decidir y aprueba con confirmación; la solicitud sale de la lista', async () => {
    const calls = await openAs(
      '/admin/solicitudes',
      adminScript({
        'GET /api/admin/inbox': json(200, [request(1, 'Laura Gómez'), request(2, 'Pedro Díaz')]),
        'POST /api/admin/appointments/1/approve': json(200, { ...request(1, 'Laura Gómez').appointment, status: 'APPROVED' }),
      }),
      'Solicitudes pendientes',
    );

    const table = await screen.findByRole('table', { name: 'Solicitudes pendientes' });
    const row = within(table).getByText('Laura Gómez').closest('tr') as HTMLElement;
    // HU-029 CA-04: paciente, especialidad, profesional, sede, fecha, horas y duración.
    expect(within(row).getByText('CC 123')).not.toBeNull();
    expect(within(row).getByText('Cardiología')).not.toBeNull();
    expect(within(row).getByText('Andrés Rincón')).not.toBeNull();
    expect(within(row).getByText('Instituto del Corazón')).not.toBeNull();
    expect(within(row).getByText(/09:00 – 10:00/)).not.toBeNull();
    expect(within(row).getByText('60 min')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Aprobar solicitud de Laura Gómez' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Aprobar esta solicitud?' });
    // Sin confirmar no se llama a la API.
    expect(calls.some((call) => call.path.endsWith('/approve'))).toBe(false);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByText('Solicitud aprobada')).not.toBeNull();
    expect(screen.queryByText('Laura Gómez')).toBeNull();
    expect(screen.getByText('Pedro Díaz')).not.toBeNull();
    expect(calls.filter((call) => call.path === '/api/admin/appointments/1/approve')).toHaveLength(1);
  });

  it('rechazar exige motivo (contador de 500) y lo envía recortado', async () => {
    const calls = await openAs(
      '/admin/solicitudes',
      adminScript({
        'GET /api/admin/inbox': json(200, [request(1, 'Laura Gómez')]),
        'POST /api/admin/appointments/1/reject': json(200, { ...request(1, 'Laura Gómez').appointment, status: 'REJECTED' }),
      }),
      'Solicitudes pendientes',
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar solicitud de Laura Gómez' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rechazar solicitud' });
    const confirm = within(dialog).getByRole('button', { name: 'Rechazar solicitud' });
    expect(confirm.hasAttribute('disabled')).toBe(true);
    expect(within(dialog).getByText('0/500')).not.toBeNull();

    const reason = within(dialog).getByLabelText(/Motivo del rechazo/);
    expect(reason.getAttribute('maxlength')).toBe('500');
    fireEvent.change(reason, { target: { value: '   ' } });
    expect(confirm.hasAttribute('disabled')).toBe(true);

    fireEvent.change(reason, { target: { value: '  El profesional no atiende ese día  ' } });
    expect(within(dialog).getByText('37/500')).not.toBeNull();
    expect(confirm.hasAttribute('disabled')).toBe(false);
    fireEvent.click(confirm);

    expect(await screen.findByText('Solicitud rechazada')).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(await screen.findByText('¡Todo al día! No hay solicitudes pendientes')).not.toBeNull();
    expect(calls.find((call) => call.path.endsWith('/reject'))?.body).toEqual({
      reason: 'El profesional no atiende ese día',
    });
  });

  it('un 409 al aprobar informa y recarga la bandeja', async () => {
    const calls = await openAs(
      '/admin/solicitudes',
      adminScript({
        'GET /api/admin/inbox': [json(200, [request(1, 'Laura Gómez')]), json(200, [])],
        'POST /api/admin/appointments/1/approve': problem(409, 'La cita ya venció: recházala con un motivo', {
          code: 'APPOINTMENT_EXPIRED',
        }),
      }),
      'Solicitudes pendientes',
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Aprobar solicitud de Laura Gómez' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aprobar' }));

    expect(await screen.findByText('La cita ya venció: recházala con un motivo')).not.toBeNull();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    await waitFor(() => {
      expect(calls.filter((call) => call.path === '/api/admin/inbox')).toHaveLength(2);
    });
  });

  it('los filtros viajan como parámetros de consulta (HU-029 CA-02/CA-03)', async () => {
    const calls = await openAs(
      '/admin/solicitudes',
      adminScript({ 'GET /api/admin/inbox': json(200, []) }),
      'Solicitudes pendientes',
    );
    await screen.findByText('¡Todo al día! No hay solicitudes pendientes');
    await screen.findByRole('option', { name: 'Instituto del Corazón' });

    fireEvent.change(screen.getByLabelText('Sede'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Especialidad'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2099-09-22' } });

    await waitFor(() => {
      expect(calls.filter((call) => call.path === '/api/admin/inbox').at(-1)?.query).toEqual({
        siteId: '2',
        specialtyId: '2',
        date: '2099-09-22',
      });
    });
  });
});

describe('especialidades', () => {
  it('crea con duración 30/60 por control segmentado y muestra el error del campo', async () => {
    const created = { ...CARDIO, id: 3, code: 'DERMATOLOGIA', name: 'Dermatología' };
    const calls = await openAs(
      '/admin/especialidades',
      adminScript({
        'POST /api/admin/specialties': [
          problem(400, 'La petición contiene campos inválidos', {
            fieldErrors: { durationMinutes: 'Solo se admiten 30 o 60 minutos' },
          }),
          json(201, created),
        ],
      }),
      'Especialidades',
    );
    await screen.findByText('Cardiología');

    fireEvent.click(screen.getByRole('button', { name: 'Nueva especialidad' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva especialidad' });
    fireEvent.change(within(dialog).getByLabelText(/^Código/), { target: { value: 'dermatologia' } });
    fireEvent.change(within(dialog).getByLabelText(/^Nombre/), { target: { value: 'Dermatología' } });

    // Solo dos duraciones posibles.
    const duration = within(dialog).getByRole('group', { name: 'Duración de la cita' });
    expect(within(duration).getAllByRole('radio').map((radio) => (radio as HTMLInputElement).value)).toEqual(['30', '60']);
    fireEvent.click(within(duration).getByRole('radio', { name: '60 min' }));
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Especializada' }));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear especialidad' }));
    expect(await within(dialog).findByText('Solo se admiten 30 o 60 minutos')).not.toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Crear especialidad' }));
    expect(await screen.findByText('Especialidad creada')).not.toBeNull();
    expect(calls.filter((call) => call.method === 'POST' && call.path === '/api/admin/specialties').at(-1)?.body).toEqual({
      code: 'DERMATOLOGIA',
      name: 'Dermatología',
      appointmentType: 'SPECIALIZED',
      durationMinutes: 60,
    });
    expect(await screen.findByText('DERMATOLOGIA')).not.toBeNull();
  });

  it('Medicina General protegida: sin desactivar ni eliminar, y sin poder cambiar su tipo', async () => {
    await openAs('/admin/especialidades', adminScript(), 'Especialidades');
    await screen.findByText('Medicina General');

    expect(screen.queryByRole('button', { name: 'Desactivar Medicina General' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Eliminar Medicina General' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Desactivar Cardiología' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Editar Medicina General' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar especialidad' });
    const type = within(dialog).getByRole('group', { name: 'Tipo de cita' }) as HTMLFieldSetElement;
    expect(type.disabled).toBe(true);
  });

  it('una especialidad en uso no se borra: 409 SPECIALTY_REFERENCED sugiere desactivarla', async () => {
    const calls = await openAs(
      '/admin/especialidades',
      adminScript({
        'DELETE /api/admin/specialties/2': problem(409, 'La especialidad está asignada a profesionales', {
          code: 'SPECIALTY_REFERENCED',
        }),
        'PATCH /api/admin/specialties/2/status': json(200, { ...CARDIO, active: false }),
      }),
      'Especialidades',
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar Cardiología' }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Eliminar esta especialidad?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(await within(dialog).findByText('Está en uso: desactívala en lugar de borrarla.')).not.toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar en su lugar' }));

    expect(await screen.findByText('Especialidad desactivada')).not.toBeNull();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ active: false });
    expect(screen.getByText('Inactiva')).not.toBeNull();
  });
});

describe('profesionales', () => {
  it('filtra por estado en el backend y busca por texto; desactivar pide confirmación', async () => {
    const calls = await openAs(
      '/admin/profesionales',
      adminScript({
        'PATCH /api/admin/professionals/10/status': json(200, { ...PROFESSIONAL, active: false }),
      }),
      'Profesionales',
    );
    await screen.findByText('Andrés Rincón');

    fireEvent.click(screen.getByRole('radio', { name: 'Inactivos' }));
    await waitFor(() => {
      expect(calls.filter((call) => call.path === '/api/admin/professionals').at(-1)?.query).toEqual({ active: 'false' });
    });

    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'zzz' } });
    expect(await screen.findByText('Ningún profesional coincide')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'rincon' } });
    expect(await screen.findByText('Andrés Rincón')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar a Andrés Rincón' }));
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    expect(await screen.findByText('Profesional desactivado')).not.toBeNull();
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ active: false });
  });

  it('alta: envía especialidades con principal y sedes; un 409 DUPLICATE marca el campo', async () => {
    const calls = await openAs(
      '/admin/profesionales/nuevo',
      adminScript({
        'GET /api/catalogs/document-types': json(200, [{ code: 'CC', name: 'Cédula de ciudadanía' }]),
        'POST /api/admin/professionals': problem(409, 'Ya existe un profesional con ese código', {
          code: 'DUPLICATE',
          field: 'professionalCode',
        }),
      }),
      'Nuevo profesional',
    );

    const type = (label: RegExp, value: string) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    type(/^Nombres/, 'Paula');
    type(/^Apellidos/, 'Serrano');
    type(/^Tipo de documento/, 'CC');
    type(/^Número de documento/, '3003');
    type(/^Correo electrónico/, 'paula@fcv.test');
    type(/^Teléfono/, '3001112233');
    type(/^Contraseña inicial/, 'Inicial-2026');
    type(/^Código profesional/, 'PRO-1');
    type(/^Matrícula/, 'MP-9');

    fireEvent.click(screen.getByRole('checkbox', { name: /Medicina General/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Cardiología/ }));
    // La primera marcada queda como principal; se cambia a Cardiología.
    fireEvent.click(screen.getByRole('radio', { name: /Principal: Cardiología/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Instituto del Corazón/ }));

    fireEvent.click(screen.getByRole('button', { name: 'Crear profesional' }));

    expect(await screen.findAllByText('Ya existe un profesional con ese código')).not.toHaveLength(0);
    expect(screen.getByLabelText(/^Código profesional/).getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByLabelText(/^Matrícula/).getAttribute('aria-invalid')).toBe('false');
    expect(calls.find((call) => call.method === 'POST' && call.path === '/api/admin/professionals')?.body).toEqual({
      firstNames: 'Paula',
      lastNames: 'Serrano',
      documentType: 'CC',
      documentNumber: '3003',
      email: 'paula@fcv.test',
      phone: '3001112233',
      password: 'Inicial-2026',
      professionalCode: 'PRO-1',
      licenseNumber: 'MP-9',
      specialtyIds: [1, 2],
      primarySpecialtyId: 2,
      siteIds: [2],
    });
  });

  it('alta sin especialidades ni sedes se señala sin llamar a la API', async () => {
    const calls = await openAs(
      '/admin/profesionales/nuevo',
      adminScript({ 'GET /api/catalogs/document-types': json(200, [{ code: 'CC', name: 'Cédula de ciudadanía' }]) }),
      'Nuevo profesional',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Crear profesional' }));
    expect(screen.getByText('Asigna al menos una especialidad.')).not.toBeNull();
    expect(screen.getByText('Asigna al menos una sede.')).not.toBeNull();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/api/admin/professionals')).toBe(false);
  });

  it('edición: código y matrícula de solo lectura; el PUT solo lleva nombres, apellidos y teléfono', async () => {
    const calls = await openAs(
      '/admin/profesionales/10',
      adminScript({
        'GET /api/admin/professionals/10': json(200, PROFESSIONAL),
        'PUT /api/admin/professionals/10': json(200, { ...PROFESSIONAL, phone: '3009998877' }),
        'PUT /api/admin/professionals/10/sites': json(200, { ...PROFESSIONAL, sites: [HIC, ICV] }),
      }),
      'Andrés Rincón',
    );

    expect(screen.queryByLabelText(/^Código profesional/)).toBeNull();
    expect(screen.queryByLabelText(/^Matrícula/)).toBeNull();
    expect(screen.getByText('PRO-1')).not.toBeNull();
    expect(screen.getByText('MP-1')).not.toBeNull();

    fireEvent.change(screen.getByLabelText(/^Teléfono/), { target: { value: '3009998877' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));
    expect(await screen.findByText('Datos actualizados')).not.toBeNull();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      firstNames: 'Andrés',
      lastNames: 'Rincón',
      phone: '3009998877',
    });

    fireEvent.click(screen.getByRole('checkbox', { name: /Hospital Internacional de Colombia/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Guardar sedes' }));
    expect(await screen.findByText('Sedes actualizadas')).not.toBeNull();
    expect(calls.find((call) => call.path === '/api/admin/professionals/10/sites')?.body).toEqual({ siteIds: [2, 1] });
  });
});


describe('correcciones de la verificación independiente', () => {
  it('F1: un profesional sin teléfono (el backend omite nulos) se edita y guarda sin error', async () => {
    const { phone: _omitted, ...withoutPhone } = PROFESSIONAL;
    const calls = await openAs(
      '/admin/profesionales/10',
      adminScript({
        'GET /api/admin/professionals/10': json(200, withoutPhone),
        'PUT /api/admin/professionals/10': json(200, { ...withoutPhone, firstNames: 'Andrés Felipe' }),
      }),
      'Andrés Rincón',
    );

    expect((screen.getByLabelText(/^Teléfono/) as HTMLInputElement).value).toBe('');
    fireEvent.change(screen.getByLabelText(/^Nombres/), { target: { value: 'Andrés Felipe' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));

    expect(await screen.findByText('Datos actualizados')).not.toBeNull();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      firstNames: 'Andrés Felipe',
      lastNames: 'Rincón',
      phone: '',
    });
  });

  it('M7: un 409 al rechazar cierra el modal, informa y recarga la bandeja', async () => {
    const calls = await openAs(
      '/admin/solicitudes',
      adminScript({
        'GET /api/admin/inbox': [json(200, [request(1, 'Laura Gómez')]), json(200, [])],
        'POST /api/admin/appointments/1/reject': problem(409, 'La solicitud ya fue decidida', {
          code: 'INVALID_TRANSITION',
        }),
      }),
      'Solicitudes pendientes',
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Rechazar solicitud de Laura Gómez' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rechazar solicitud' });
    fireEvent.change(within(dialog).getByLabelText(/Motivo del rechazo/), { target: { value: 'Sin agenda' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rechazar solicitud' }));

    expect(await screen.findByText('La solicitud ya fue decidida')).not.toBeNull();
    expect(screen.getByText('La solicitud ya no se puede decidir')).not.toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => {
      expect(calls.filter((call) => call.path === '/api/admin/inbox')).toHaveLength(2);
    });
    expect(await screen.findByText('¡Todo al día! No hay solicitudes pendientes')).not.toBeNull();
  });

  it('M11: el alta no ofrece especialidades inactivas', async () => {
    await openAs(
      '/admin/profesionales/nuevo',
      adminScript({
        'GET /api/catalogs/document-types': json(200, [{ code: 'CC', name: 'Cédula de ciudadanía' }]),
        'GET /api/admin/specialties': json(200, [
          GENERAL,
          CARDIO,
          { ...CARDIO, id: 3, code: 'DERMATOLOGIA', name: 'Dermatología', active: false },
        ]),
      }),
      'Nuevo profesional',
    );

    expect(screen.getByRole('checkbox', { name: /Cardiología/ })).not.toBeNull();
    expect(screen.queryByRole('checkbox', { name: /Dermatología/ })).toBeNull();
    expect(screen.queryByText('Dermatología')).toBeNull();
  });

  it('una ruta de profesional con id no numérico muestra "no encontrado" sin pedir /NaN', async () => {
    const calls = await openAs('/admin/profesionales/abc', adminScript(), 'Editar profesional');
    expect(await screen.findByText('No encontramos este profesional')).not.toBeNull();
    expect(calls.some((call) => call.path.includes('NaN') || call.path.endsWith('/abc'))).toBe(false);
  });
});
