// @vitest-environment jsdom
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SIDEBAR_COLLAPSED_KEY } from './app/AppShell';
import { goTo, installBackend, json, renderLoggedIn, sessionScript } from './test/fakeBackend';

/**
 * Marco autenticado: la hamburguesa oculta/muestra el menú lateral (barra fija en escritorio,
 * panel desplegable en pantallas estrechas) y ya no existe el botón "X" de cerrar.
 */

const SUMMARY = { pendingRequests: 3, activeProfessionals: 5, activeSpecialties: 7, appointmentsToday: 2 };

/** Simula el ancho de ventana: `desktop` responde a la media query de escritorio. */
function stubViewport(desktop: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: desktop,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

async function loginAdmin() {
  installBackend({ ...sessionScript('ADMIN'), 'GET /api/admin/summary': json(200, SUMMARY) });
  await renderLoggedIn('Marta Ruiz');
  await screen.findByText('Solicitudes pendientes');
}

function menuButton(): HTMLElement {
  return screen.getByRole('button', { name: /(Ocultar|Mostrar) menú/ });
}

function appRoot(): HTMLElement {
  return document.querySelector('.app') as HTMLElement;
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('menú lateral en pantallas estrechas (panel desplegable)', () => {
  beforeEach(() => stubViewport(false));

  it('no hay botón "X" de cerrar dentro del menú', async () => {
    await loginAdmin();
    expect(screen.queryByRole('button', { name: 'Cerrar menú' })).toBeNull();
    expect(document.querySelector('.sidebar__close')).toBeNull();
  });

  it('la hamburguesa abre y cierra el panel, con aria-expanded/aria-controls coherentes', async () => {
    await loginAdmin();
    const button = menuButton();
    const nav = screen.getByRole('complementary', { name: 'Navegación principal' });

    expect(button.getAttribute('aria-controls')).toBe(nav.id);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Mostrar menú');

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Ocultar menú');
    expect(appRoot().classList.contains('app--menu-open')).toBe(true);

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(appRoot().classList.contains('app--menu-open')).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('Esc cierra el panel y devuelve el foco a la hamburguesa', async () => {
    await loginAdmin();
    const button = menuButton();
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(appRoot().classList.contains('app--menu-open')).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('el clic en el fondo y la navegación a otra ruta cierran el panel', async () => {
    await loginAdmin();
    const button = menuButton();

    fireEvent.click(button);
    fireEvent.click(document.querySelector('.app__scrim') as HTMLElement);
    expect(button.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    goTo('/paciente');
    expect(await screen.findByText('Sin permiso para ver esta página')).not.toBeNull();
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
  });
});

describe('menú lateral en escritorio (barra fija)', () => {
  beforeEach(() => stubViewport(true));

  it('la hamburguesa oculta y muestra la barra, y recuerda la preferencia', async () => {
    await loginAdmin();
    const button = menuButton();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Ocultar menú');

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(button.getAttribute('aria-label')).toBe('Mostrar menú');
    expect(appRoot().classList.contains('app--sidebar-collapsed')).toBe(true);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('true');

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(appRoot().classList.contains('app--sidebar-collapsed')).toBe(false);
    expect(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY)).toBe('false');
  });

  it('arranca oculta si la preferencia guardada lo indica', async () => {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true');
    await loginAdmin();
    expect(menuButton().getAttribute('aria-expanded')).toBe('false');
    expect(appRoot().classList.contains('app--sidebar-collapsed')).toBe(true);
  });

  it('si el almacenamiento falla, el menú queda visible y la hamburguesa sigue funcionando', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('bloqueado');
    });
    await loginAdmin();
    const button = menuButton();
    expect(button.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
