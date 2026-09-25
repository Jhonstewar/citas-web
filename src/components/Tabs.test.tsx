// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tabs, type TabItem } from './Tabs';

/** Pestañas accesibles (patrón WAI-ARIA Tabs) que se usarán en la agenda y en EPS/planes. */

const TABS: TabItem[] = [
  { id: 'blocks', label: 'Bloques', content: <p>Contenido de bloques</p> },
  { id: 'appointments', label: 'Citas', content: <p>Contenido de citas</p> },
  { id: 'history', label: 'Historial', content: <p>Contenido del historial</p> },
];

afterEach(() => cleanup());

const tab = (name: string) => screen.getByRole('tab', { name });

describe('Tabs', () => {
  it('expone tablist, tab y tabpanel enlazados, con la primera pestaña activa', () => {
    render(<Tabs label="Secciones de la agenda" tabs={TABS} />);

    const list = screen.getByRole('tablist', { name: 'Secciones de la agenda' });
    expect(list).toBeTruthy();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);

    const blocks = tab('Bloques');
    const appointments = tab('Citas');
    expect(blocks.getAttribute('aria-selected')).toBe('true');
    expect(appointments.getAttribute('aria-selected')).toBe('false');
    // Tabindex itinerante: solo la activa entra en el orden de Tab.
    expect(blocks.tabIndex).toBe(0);
    expect(appointments.tabIndex).toBe(-1);

    const panel = screen.getByRole('tabpanel', { name: 'Bloques' });
    expect(panel.id).toBe(blocks.getAttribute('aria-controls'));
    expect(panel.textContent).toBe('Contenido de bloques');
    // El panel inactivo existe (aria-controls válido) pero no monta su contenido.
    expect(screen.queryByText('Contenido de citas')).toBeNull();
  });

  it('cambia de panel al hacer clic', () => {
    render(<Tabs label="Secciones" tabs={TABS} />);

    fireEvent.click(screen.getByRole('tab', { name: 'Citas' }));

    expect(screen.getByRole('tab', { name: 'Citas' }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tabpanel', { name: 'Citas' }).textContent).toBe('Contenido de citas');
    expect(screen.queryByText('Contenido de bloques')).toBeNull();
  });

  it('se mueve con las flechas (con vuelta), Inicio y Fin, y lleva el foco', () => {
    render(<Tabs label="Secciones" tabs={TABS} />);
    const [blocks, appointments, history] = [tab('Bloques'), tab('Citas'), tab('Historial')];
    blocks.focus();

    fireEvent.keyDown(blocks, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(appointments);
    expect(appointments.getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(appointments, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(blocks);

    fireEvent.keyDown(blocks, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(history);
    expect(screen.getByRole('tabpanel', { name: 'Historial' })).toBeTruthy();

    fireEvent.keyDown(history, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(blocks);

    fireEvent.keyDown(blocks, { key: 'End' });
    expect(document.activeElement).toBe(history);

    fireEvent.keyDown(history, { key: 'Home' });
    expect(document.activeElement).toBe(blocks);
  });

  it('salta las pestañas deshabilitadas', () => {
    const tabs = TABS.map((tab) => (tab.id === 'appointments' ? { ...tab, disabled: true } : tab));
    render(<Tabs label="Secciones" tabs={tabs} />);
    const [blocks, appointments, history] = [tab('Bloques'), tab('Citas'), tab('Historial')];
    expect((appointments as HTMLButtonElement).disabled).toBe(true);

    blocks.focus();
    fireEvent.keyDown(blocks, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(history);
    expect(history.getAttribute('aria-selected')).toBe('true');
  });

  it('en modo controlado respeta value y notifica onChange', () => {
    const onChange = vi.fn();
    function Controlled() {
      const [value, setValue] = useState('appointments');
      return (
        <Tabs
          label="Secciones"
          tabs={TABS}
          value={value}
          onChange={(id) => {
            onChange(id);
            setValue(id);
          }}
        />
      );
    }
    render(<Controlled />);
    expect(screen.getByRole('tab', { name: 'Citas' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.click(screen.getByRole('tab', { name: 'Historial' }));

    expect(onChange).toHaveBeenCalledWith('history');
    expect(screen.getByRole('tabpanel', { name: 'Historial' })).toBeTruthy();
  });
});
