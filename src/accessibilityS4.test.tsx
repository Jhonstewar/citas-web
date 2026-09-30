// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserResponse } from './api/contracts';
import { TextAreaField, SegmentedControl } from './components/ChoiceControls';
import { Modal } from './components/Modal';
import { SelectField } from './components/SelectField';
import { TextField } from './components/TextField';
import {
  installBackend,
  insurancePlan,
  json,
  problem,
  profileScript,
  renderLoggedIn,
  sessionScript,
  userWith,
} from './test/fakeBackend';

/**
 * Accesibilidad básica de las pantallas nuevas de S4 (F9): errores de campo anunciados,
 * foco que no escapa de un diálogo aunque el botón se deshabilite, y fallos de carga de
 * listas auxiliares visibles como alerta (con reintento donde hay algo que reintentar).
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('errores de campo anunciados por lectores de pantalla', () => {
  it('TextField, SelectField, TextAreaField y SegmentedControl exponen el error con role="alert"', () => {
    render(
      <>
        <TextField label="Nombres" error="Escribe tus nombres." onChange={() => undefined} value="" />
        <SelectField label="Plan" options={[]} error="Elige un plan." onChange={() => undefined} value="" />
        <TextAreaField label="Motivo" error="Motivo demasiado largo." onChange={() => undefined} value="" />
        <SegmentedControl
          legend="Duración"
          name="d"
          options={[{ value: 'a', label: 'A' }]}
          value="a"
          onChange={() => undefined}
          error="Elige una duración."
        />
      </>,
    );
    const alerts = screen.getAllByRole('alert').map((node) => node.textContent);
    expect(alerts).toEqual([
      'Escribe tus nombres.',
      'Elige un plan.',
      'Motivo demasiado largo.',
      'Elige una duración.',
    ]);
    // Y siguen asociados al control con aria-describedby.
    expect(screen.getByLabelText('Nombres').getAttribute('aria-describedby')).not.toBeNull();
  });

  it('sin error no hay alerta', () => {
    render(<TextField label="Nombres" value="" onChange={() => undefined} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

function BusyDialog({ trigger }: { trigger?: boolean }) {
  const [open, setOpen] = useState(trigger !== true);
  const [busy, setBusy] = useState(false);
  return (
    <main id="contenido" tabIndex={-1}>
      {trigger === true ? (
        <button type="button" onClick={() => setOpen(true)}>
          Abrir
        </button>
      ) : null}
      <button type="button">Fuera del diálogo</button>
      <Modal
        open={open}
        title="Diálogo de prueba"
        onClose={() => setOpen(false)}
        dismissible={!busy}
        footer={
          <button
            type="button"
            disabled={busy}
            onClick={(event) => {
              // En un navegador real, deshabilitar el control enfocado lo suelta al <body>.
              event.currentTarget.blur();
              setBusy(true);
            }}
          >
            Enviar
          </button>
        }
      >
        <p>Contenido</p>
      </Modal>
    </main>
  );
}

describe('foco en diálogos', () => {
  it('si el botón enfocado se deshabilita (petición en vuelo), el foco queda dentro del diálogo', async () => {
    render(<BusyDialog />);
    const dialog = screen.getByRole('dialog', { name: 'Diálogo de prueba' });
    const send = within(dialog).getByRole<HTMLButtonElement>('button', { name: 'Enviar' });
    send.focus();
    fireEvent.click(send);

    await waitFor(() => expect(send.disabled).toBe(true));
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('al cerrar devuelve el foco a quien lo abrió', async () => {
    render(<BusyDialog trigger />);
    const opener = screen.getByRole('button', { name: 'Abrir' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it('si quien lo abrió desaparece, el foco pasa al contenido principal y no al <body>', async () => {
    function Vanishing() {
      const [open, setOpen] = useState(false);
      const [gone, setGone] = useState(false);
      return (
        <main id="contenido" tabIndex={-1}>
          {gone ? null : (
            <button type="button" onClick={() => setOpen(true)}>
              Cancelar cita
            </button>
          )}
          <Modal
            open={open}
            title="Confirmar"
            onClose={() => {
              setGone(true);
              setOpen(false);
            }}
          >
            <p>Seguro</p>
          </Modal>
        </main>
      );
    }
    render(<Vanishing />);
    const opener = screen.getByRole('button', { name: 'Cancelar cita' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(await screen.findByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.queryByRole('button', { name: 'Cancelar cita' })).toBeNull();
    expect(document.activeElement).toBe(document.getElementById('contenido'));
  });
});

describe('fallos de carga de listas auxiliares', () => {
  it('perfil: si los planes no cargan, alerta con Reintentar y el selector se recupera', async () => {
    const user = userWith('USER') as UserResponse;
    installBackend({
      ...sessionScript('USER'),
      'GET /api/patient/appointments': json(200, []),
      ...profileScript(user, [insurancePlan()]),
      'GET /api/catalogs/insurance-plans': [
        problem(503, 'Servicio no disponible'),
        json(200, [insurancePlan()]),
      ],
    });
    await renderLoggedIn('Laura Gómez', '/paciente/perfil');
    await screen.findByRole('heading', { level: 1, name: 'Mi perfil' });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/No pudimos cargar los planes/);
    const select = screen.getByLabelText('Plan de afiliación') as HTMLSelectElement;
    expect(select.disabled).toBe(true);

    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    await waitFor(() => expect((screen.getByLabelText('Plan de afiliación') as HTMLSelectElement).disabled).toBe(false));
  });
});
