import type { ReactNode } from 'react';

/**
 * Entrada genérica de una línea de tiempo. El componente no conoce el contrato de la API:
 * quien lo usa traduce sus datos (p. ej. `HistoryEntry`) a textos ya listos para mostrar.
 */
export interface TimelineEntry {
  /** Clave estable de la entrada; si falta se usa la posición. */
  id?: string | undefined;
  /** Código de estado (p. ej. `APPROVED`). No se pinta: queda en `data-status` para estilos futuros. */
  status?: string | undefined;
  /** Texto visible del estado o del evento. */
  label: ReactNode;
  /** Quién hizo el cambio, ya redactado ("por ti", "por Administración"…). */
  actor?: ReactNode;
  /** Motivo del cambio; si está vacío no se muestra. */
  reason?: string | null | undefined;
  /** Fecha y hora ya formateadas para mostrar. */
  date: ReactNode;
}

export interface TimelineProps {
  entries: readonly TimelineEntry[];
  /** Texto cuando no hay entradas. */
  emptyMessage?: ReactNode;
  'aria-label'?: string | undefined;
}

/** Línea de tiempo vertical (historial de una cita), en el orden recibido. */
export function Timeline({
  entries,
  emptyMessage = 'Sin cambios registrados.',
  'aria-label': ariaLabel,
}: TimelineProps) {
  if (entries.length === 0) {
    return <p className="muted text-sm">{emptyMessage}</p>;
  }
  return (
    <ol className="timeline" aria-label={ariaLabel}>
      {entries.map((entry, index) => (
        <li key={entry.id ?? index} className="timeline__item" data-status={entry.status}>
          <span className="timeline__dot" aria-hidden="true" />
          <div className="timeline__body">
            <span className="strong">{entry.label}</span>
            <span className="timeline__meta">
              {entry.actor !== undefined && entry.actor !== null && entry.actor !== '' ? (
                <>{entry.actor} · </>
              ) : null}
              {entry.date}
            </span>
            {entry.reason !== undefined && entry.reason !== null && entry.reason !== '' ? (
              <span className="timeline__meta">Motivo: {entry.reason}</span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
