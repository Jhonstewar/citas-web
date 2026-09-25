// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './components/Modal';
import {
  installBackend,
  json,
  problem,
  renderLoggedIn,
  sessionScript,
  withoutBootRefresh,
} from './test/fakeBackend';

/**
 * HU-005 CA-08 (la interfaz refleja el rol) y CA-09 (401 → login; 403 → aviso sin cerrar
 * sesión), sobre la aplicación real con el backend simulado.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

const SUMMARY = { pendingRequests: 3, activeProfessionals: 5, activeSpecialties: 7, appointmentsToday: 2 };

function navLinks(): string[] {
  const nav = screen.getByRole('complementary', { name: 'Navegación principal' });
  return within(nav)
    .getAllByRole('link')
    .map((link) => link.textContent ?? '');
}

describe('navegación por rol (HU-005 CA-08)', () => {
  it('el USER entra a /paciente y solo ve la navegación de paciente', async () => {
    installBackend({ ...sessionScript('USER'), 'GET /api/patient/appointments': json(200, []) });

    await renderLoggedIn('Laura Gómez');

    expect(await screen.findByRole('heading', { name: 'Hola, Laura' })).not.toBeNull();
    expect(window.location.pathname).toBe('/paciente');
    expect(navLinks()).toEqual(['Inicio', 'Agendar cita', 'Mis citas', 'Mi perfil']);
  });

  it('el ADMIN entra a /admin con su panel y su navegación', async () => {
    installBackend({ ...sessionScript('ADMIN'), 'GET /api/admin/summary': json(200, SUMMARY) });

    await renderLoggedIn('Marta Ruiz');

    expect(await screen.findByText('Solicitudes pendientes')).not.toBeNull();
    expect(window.location.pathname).toBe('/admin');
    expect(navLinks()).toEqual(['Panel', 'Solicitudes', 'Profesionales', 'Especialidades', 'EPS y planes']);
    expect(screen.queryByRole('link', { name: 'Agendar cita' })).toBeNull();
  });

  it('el PROFESSIONAL entra a /profesional y ve solo su navegación', async () => {
    installBackend({
      ...sessionScript('PROFESSIONAL'),
      'GET /api/professional/me': json(200, {
        id: 1,
        fullName: 'Andrés Rincón',
        specialties: [],
        sites: [],
      }),
      'GET /api/professional/blocks': json(200, []),
    });

    await renderLoggedIn('Andrés Rincón');

    expect(window.location.pathname).toBe('/profesional');
    expect(navLinks()).toEqual(['Inicio', 'Mi agenda']);
  });

  it('una ruta de otro rol muestra "Sin permiso" sin pedir datos ni cerrar la sesión', async () => {
    const calls = installBackend({
      ...sessionScript('USER'),
      'GET /api/patient/appointments': json(200, []),
    });

    await renderLoggedIn('Laura Gómez', '/admin/solicitudes');

    expect(await screen.findByText('Sin permiso para ver esta página')).not.toBeNull();
    // La vista de ADMIN no se presentó: no se llamó a su API.
    expect(calls.some((call) => call.path.startsWith('/api/admin'))).toBe(false);
    expect(calls.some((call) => call.path === '/api/auth/logout')).toBe(false);
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).not.toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Ir a mi inicio' }));
    expect(await screen.findByRole('heading', { name: 'Hola, Laura' })).not.toBeNull();
  });

  it('"/" lleva al inicio del rol', async () => {
    installBackend({ ...sessionScript('ADMIN'), 'GET /api/admin/summary': json(200, SUMMARY) });
    await renderLoggedIn('Marta Ruiz', '/');
    await waitFor(() => expect(window.location.pathname).toBe('/admin'));
  });
});

describe('401 frente a 403 (HU-005 CA-09)', () => {
  it('un 403 de la API muestra "Permiso insuficiente" y mantiene la sesión abierta', async () => {
    const calls = installBackend({
      ...sessionScript('ADMIN'),
      'GET /api/admin/summary': problem(403, 'No tiene permisos para realizar esta operación'),
    });

    await renderLoggedIn('Marta Ruiz');

    expect(await screen.findByText('Permiso insuficiente')).not.toBeNull();
    expect(screen.getByText(/No tiene permisos para realizar esta operación/)).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).not.toBeNull();
    expect(calls.some((call) => call.path === '/api/auth/logout')).toBe(false);
    // Un 403 no renueva: la única renovación es el intento de restaurar sesión del arranque (D36).
    expect(withoutBootRefresh(calls).some((call) => call.path === '/api/auth/refresh')).toBe(false);
  });

  it('un 401 cuya renovación es rechazada lleva al login', async () => {
    installBackend({
      ...sessionScript('ADMIN'),
      'GET /api/admin/summary': problem(401, 'Se requiere un access token válido'),
      'POST /api/auth/refresh': problem(401, 'La sesión no es válida o ha expirado'),
    });

    await renderLoggedIn('Marta Ruiz');

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).not.toBeNull();
    expect(screen.queryByText('Permiso insuficiente')).toBeNull();
  });
});

describe('Modal accesible', () => {
  function Harness({ onClose }: { onClose: () => void }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
        <Modal
          open={open}
          title="Nuevo bloque"
          onClose={() => {
            onClose();
            setOpen(false);
          }}
          footer={<button type="button">Guardar</button>}
        >
          <input aria-label="Fecha" />
        </Modal>
      </>
    );
  }

  it('declara aria-modal, enfoca el contenido, atrapa el foco y se cierra con Escape', () => {
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('dialog', { name: 'Nuevo bloque' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Fecha'));

    // Tab desde el último control vuelve al primero.
    screen.getByRole('button', { name: 'Guardar' }).focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cerrar' }));

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
