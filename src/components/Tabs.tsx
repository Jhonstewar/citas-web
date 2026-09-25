import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  /** Identificador estable de la pestaña; es el valor de `value` / `onChange`. */
  id: string;
  label: ReactNode;
  /** Icono decorativo delante del texto. */
  icon?: ReactNode;
  /** Contenido del panel. Solo se monta el de la pestaña activa. */
  content: ReactNode;
  disabled?: boolean | undefined;
}

export interface TabsProps {
  tabs: readonly TabItem[];
  /** Nombre accesible de la lista de pestañas (p. ej. "Secciones de la agenda"). */
  label: string;
  /** Pestaña activa en modo controlado. */
  value?: string | undefined;
  /** Pestaña inicial en modo no controlado; por defecto, la primera habilitada. */
  defaultValue?: string | undefined;
  onChange?: ((id: string) => void) | undefined;
  className?: string | undefined;
}

/**
 * Pestañas accesibles según el patrón WAI-ARIA "Tabs" con activación automática:
 * `tablist` / `tab` / `tabpanel`, `aria-selected`, tabindex itinerante (solo la pestaña activa
 * entra en el orden de Tab), flechas izquierda/derecha con vuelta al principio, Inicio y Fin.
 * Las pestañas deshabilitadas se saltan con el teclado.
 *
 * Todos los paneles existen en el DOM (para que `aria-controls` apunte a algo), pero solo el
 * activo monta su contenido: un panel oculto no dispara sus peticiones.
 */
export function Tabs({ tabs, label, value, defaultValue, onChange, className }: TabsProps) {
  const baseId = useId();
  const firstEnabled = tabs.find((tab) => tab.disabled !== true)?.id ?? tabs[0]?.id ?? '';
  const [internal, setInternal] = useState(defaultValue ?? firstEnabled);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const requested = value ?? internal;
  // Si la pestaña pedida no existe o está deshabilitada, se muestra la primera habilitada.
  const active = tabs.some((tab) => tab.id === requested && tab.disabled !== true) ? requested : firstEnabled;

  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  function select(id: string) {
    if (value === undefined) {
      setInternal(id);
    }
    if (id !== active) {
      onChange?.(id);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const enabled = tabs.filter((tab) => tab.disabled !== true);
    if (enabled.length === 0) {
      return;
    }
    const current = enabled.findIndex((tab) => tab.id === active);
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
        next = (current + 1) % enabled.length;
        break;
      case 'ArrowLeft':
        next = (current - 1 + enabled.length) % enabled.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = enabled.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    const target = enabled[next];
    if (target === undefined) {
      return;
    }
    select(target.id);
    tabRefs.current.get(target.id)?.focus();
  }

  return (
    <div className={['tabs', className].filter(Boolean).join(' ')}>
      <div role="tablist" aria-label={label} aria-orientation="horizontal" className="tabs__list" onKeyDown={handleKeyDown}>
        {tabs.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node === null) {
                  tabRefs.current.delete(tab.id);
                } else {
                  tabRefs.current.set(tab.id, node);
                }
              }}
              type="button"
              role="tab"
              id={tabId(tab.id)}
              aria-selected={selected}
              aria-controls={panelId(tab.id)}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              className="tabs__tab"
              onClick={() => select(tab.id)}
            >
              {tab.icon !== undefined ? (
                <span className="tabs__icon" aria-hidden="true">
                  {tab.icon}
                </span>
              ) : null}
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <div
            key={tab.id}
            role="tabpanel"
            id={panelId(tab.id)}
            aria-labelledby={tabId(tab.id)}
            tabIndex={0}
            hidden={!selected}
            className="tabs__panel"
          >
            {selected ? tab.content : null}
          </div>
        );
      })}
    </div>
  );
}
