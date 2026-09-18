// @vitest-environment jsdom
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installBackend,
  json,
  noContent,
  problem,
  renderLoggedIn,
  sessionScript,
  type Script,
} from './test/fakeBackend';

/**
 * Agenda del profesional (HU-017..019): semana con franjas libres/ocupadas (HU-019 CA-02),
 * semana vacía (CA-05), crear bloque con error del backend visible en el formulario, bloques no
 * editables y eliminación con confirmación.
 */

const HIC = { id: 1, code: 'HIC', name: 'Hospital Internacional de Colombia' };

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
  // Solo HIC: la otra sede no debe ofrecerse.
  sites: [HIC],
};

function slots(start: number, count: number, taken: number[] = []) {
  return Array.from({ length: count }, (_, index) => {
    const minutes = start * 60 + index * 30;
    const time = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return { id: 100 + index, startTime: time(minutes), endTime: time(minutes + 30), available: !taken.includes(index) };
  });
}

const FUTURE_BLOCK = {
  id: 1,
  date: '2026-09-23',
  startTime: '08:00',
  endTime: '12:00',
  site: HIC,
  editable: false,
  // Una ocupada por cita aprobada y otra retenida por solicitud: 6 libres de 8.
  slots: slots(8, 8, [1, 4]),
};

const EDITABLE_BLOCK = {
  id: 2,
  date: '2026-09-24',
  startTime: '14:00',
  endTime: '15:00',
  site: HIC,
  editable: true,
  slots: slots(14, 2),
};

function agendaScript(extra: Script = {}): Script {
  return {
    ...sessionScript('PROFESSIONAL'),
    'GET /api/professional/me': json(200, PROFILE),
    ...extra,
  };
}

async function openAgenda(script: Script) {
  const calls = installBackend(script);
  await renderLoggedIn('Andrés Rincón', '/profesional/agenda');
  await screen.findByRole('heading', { name: 'Mi agenda' });
  return calls;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  // Lunes 21 de septiembre de 2026.
  vi.setSystemTime(new Date('2026-09-21T13:00:00Z'));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('agenda semanal', () => {
  it('muestra los bloques de lunes a domingo y diferencia franjas libres de ocupadas (HU-019 CA-02)', async () => {
    const calls = await openAgenda(
      agendaScript({ 'GET /api/professional/blocks': json(200, [FUTURE_BLOCK, EDITABLE_BLOCK]) }),
    );

    const block = await screen.findByRole('article', { name: /Bloque 08:00 a 12:00/ });
    expect(within(block).getByText('6 de 8 franjas libres')).not.toBeNull();
    expect(within(block).getAllByText('Libre')).toHaveLength(6);
    expect(within(block).getAllByText('Ocupada')).toHaveLength(2);
    expect(within(block).getByText('Hospital Internacional de Colombia')).not.toBeNull();

    // Bloque no editable: sin acciones y con explicación.
    expect(within(block).queryByRole('button')).toBeNull();
    expect(within(block).getByText(/No editable/)).not.toBeNull();

    const weekCall = calls.filter((call) => call.path === '/api/professional/blocks').at(-1);
    expect(weekCall?.query).toEqual({ from: '2026-09-21', to: '2026-09-27' });

    fireEvent.click(screen.getByRole('button', { name: /Semana siguiente/ }));
    await waitFor(() => {
      const last = calls.filter((call) => call.path === '/api/professional/blocks').at(-1);
      expect(last?.query).toEqual({ from: '2026-09-28', to: '2026-10-04' });
    });
  });

  it('una semana sin bloques muestra el estado vacío, no un error (HU-019 CA-05)', async () => {
    await openAgenda(agendaScript({ 'GET /api/professional/blocks': json(200, []) }));
    expect(await screen.findByText('No tienes bloques esta semana')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Crear bloque' })).not.toBeNull();
  });
});

describe('crear, editar y eliminar bloques', () => {
  it('crea un bloque: solo sedes asignadas, cuenta las franjas y muestra el 409 en el formulario', async () => {
    const created = { ...EDITABLE_BLOCK, id: 3, date: '2026-09-22', startTime: '08:00', endTime: '12:00', slots: slots(8, 8) };
    const calls = await openAgenda(
      agendaScript({
        // Inicio del profesional, agenda y recarga tras crear.
        'GET /api/professional/blocks': [json(200, []), json(200, []), json(200, [created])],
        'POST /api/professional/blocks': [
          problem(409, 'Se cruza con otro bloque de 10:00 a 12:00', { code: 'BLOCK_OVERLAP' }),
          json(201, created),
        ],
      }),
    );
    await screen.findByText('No tienes bloques esta semana');

    fireEvent.click(screen.getByRole('button', { name: 'Nuevo bloque' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo bloque de disponibilidad' });

    const site = within(dialog).getByLabelText(/^Sede/) as HTMLSelectElement;
    const options = Array.from(site.options).map((option) => option.textContent);
    expect(options).toEqual(['Selecciona…', 'Hospital Internacional de Colombia']);
    // Con una sola sede asignada queda preseleccionada.
    expect(site.value).toBe('1');

    fireEvent.change(within(dialog).getByLabelText(/^Fecha/), { target: { value: '2026-09-22' } });
    expect(within(dialog).getByText('Se crearán 8 franjas de 30 minutos (08:00 – 12:00).')).not.toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Hora de fin/), { target: { value: '09:00' } });
    expect(within(dialog).getByText('Se crearán 2 franjas de 30 minutos (08:00 – 09:00).')).not.toBeNull();
    fireEvent.change(within(dialog).getByLabelText(/^Hora de fin/), { target: { value: '12:00' } });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar bloque' }));

    expect(await within(dialog).findByText('Se cruza con otro bloque de 10:00 a 12:00')).not.toBeNull();
    expect(screen.getByRole('dialog')).not.toBeNull();
    expect(calls.find((call) => call.method === 'POST' && call.path === '/api/professional/blocks')?.body).toEqual({
      siteId: 1,
      date: '2026-09-22',
      startTime: '08:00',
      endTime: '12:00',
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar bloque' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(await screen.findByText('Bloque creado')).not.toBeNull();
    expect(await screen.findByRole('article', { name: /Bloque 08:00 a 12:00/ })).not.toBeNull();
  });

  it('la hora de fin anterior al inicio se señala en el campo sin llamar a la API', async () => {
    const calls = await openAgenda(agendaScript({ 'GET /api/professional/blocks': json(200, []) }));
    await screen.findByText('No tienes bloques esta semana');
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo bloque' }));
    const dialog = await screen.findByRole('dialog');

    fireEvent.change(within(dialog).getByLabelText(/^Hora de inicio/), { target: { value: '10:00' } });
    fireEvent.change(within(dialog).getByLabelText(/^Hora de fin/), { target: { value: '09:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar bloque' }));

    expect(within(dialog).getByText('La hora de fin debe ser posterior a la de inicio.')).not.toBeNull();
    expect(within(dialog).getByLabelText(/^Hora de fin/).getAttribute('aria-invalid')).toBe('true');
    expect(calls.some((call) => call.path === '/api/professional/blocks' && call.method === 'POST')).toBe(false);
  });

  it('edita un bloque editable con PUT', async () => {
    const calls = await openAgenda(
      agendaScript({
        'GET /api/professional/blocks': json(200, [EDITABLE_BLOCK]),
        'PUT /api/professional/blocks/2': json(200, { ...EDITABLE_BLOCK, endTime: '16:00', slots: slots(14, 4) }),
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Editar bloque de 14:00 a 15:00/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar bloque' });
    fireEvent.change(within(dialog).getByLabelText(/^Hora de fin/), { target: { value: '16:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar bloque' }));

    expect(await screen.findByText('Bloque actualizado')).not.toBeNull();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
      siteId: 1,
      date: '2026-09-24',
      startTime: '14:00',
      endTime: '16:00',
    });
  });

  it('elimina con confirmación; un 409 se muestra en el diálogo', async () => {
    const calls = await openAgenda(
      agendaScript({
        'GET /api/professional/blocks': json(200, [EDITABLE_BLOCK]),
        'DELETE /api/professional/blocks/2': [
          problem(409, 'El bloque tiene citas reservadas', { code: 'BLOCK_HAS_APPOINTMENTS' }),
          noContent(),
        ],
      }),
    );
    fireEvent.click(await screen.findByRole('button', { name: /Eliminar bloque de 14:00 a 15:00/ }));
    const dialog = await screen.findByRole('alertdialog', { name: '¿Eliminar este bloque?' });
    // El foco empieza en "Cancelar": un Enter accidental no borra.
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar bloque' }));
    expect(await within(dialog).findByText('El bloque tiene citas reservadas')).not.toBeNull();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Eliminar bloque' }));
    expect(await screen.findByText('Bloque eliminado')).not.toBeNull();
    expect(screen.queryByRole('article', { name: /Bloque 14:00/ })).toBeNull();
    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(2);
  });
});

