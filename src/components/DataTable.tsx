import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Alinear a la derecha (acciones, números). */
  align?: 'start' | 'end';
  /** Columna principal: en móvil encabeza la tarjeta. */
  primary?: boolean;
}

export interface DataTableProps<T> {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string | number;
}

/**
 * Tabla semántica que en pantallas estrechas se presenta como lista de tarjetas: cada celda
 * lleva su encabezado en `data-label`, que el CSS muestra solo en móvil.
 */
export function DataTable<T>({ caption, columns, rows, rowKey }: DataTableProps<T>) {
  return (
    <div className="table-wrap">
      <table className="table">
        <caption className="visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={column.align === 'end' ? 'table__cell--end' : undefined}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  data-label={column.header}
                  className={[
                    column.align === 'end' ? 'table__cell--end' : '',
                    column.primary === true ? 'table__cell--primary' : '',
                  ]
                    .filter(Boolean)
                    .join(' ') || undefined}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
