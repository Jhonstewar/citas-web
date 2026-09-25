import type { ReactNode } from 'react';

export interface DetailListProps {
  children: ReactNode;
  /** Columnas desde 40rem de ancho; en móvil siempre es una sola. */
  columns?: 1 | 2;
  /** Nombre accesible de la lista cuando el contexto no la titula. */
  'aria-label'?: string | undefined;
  className?: string | undefined;
}

/** Lista de definición (`<dl>`) de datos de solo lectura: fecha, hora, sede… */
export function DetailList({ children, columns = 1, 'aria-label': ariaLabel, className }: DetailListProps) {
  return (
    <dl
      className={['details', columns === 2 ? 'details--2' : null, className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
    >
      {children}
    </dl>
  );
}

export interface DetailItemProps {
  label: string;
  children: ReactNode;
  /** Icono decorativo: se oculta a los lectores de pantalla. */
  icon?: ReactNode;
}

/** Par término/valor de una `DetailList`, con icono decorativo opcional. */
export function DetailItem({ label, children, icon }: DetailItemProps) {
  return (
    <div className="details__item">
      {icon !== undefined ? (
        <span className="details__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div>
        <dt>{label}</dt>
        <dd>{children}</dd>
      </div>
    </div>
  );
}
