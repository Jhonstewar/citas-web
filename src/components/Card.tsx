import { useId, type ReactNode } from 'react';

export interface CardProps {
  title?: ReactNode;
  /** Texto de apoyo bajo el título. */
  description?: ReactNode;
  /** Acciones alineadas a la derecha del título. */
  actions?: ReactNode;
  children?: ReactNode;
  /** Icono decorativo junto al título. */
  icon?: ReactNode;
  className?: string;
  /** Etiqueta HTML de la tarjeta; `section` si tiene título. */
  as?: 'section' | 'article' | 'div';
  busy?: boolean;
}

/** Superficie base del sistema: fondo, radio generoso y sombra suave. */
export function Card({
  title,
  description,
  actions,
  children,
  icon,
  className,
  as,
  busy,
}: CardProps) {
  const titleId = useId();
  const Tag = as ?? (title !== undefined ? 'section' : 'div');
  const hasHeader = title !== undefined || actions !== undefined;

  return (
    <Tag
      className={['card', className].filter(Boolean).join(' ')}
      {...(title !== undefined ? { 'aria-labelledby': titleId } : {})}
      {...(busy !== undefined ? { 'aria-busy': busy } : {})}
    >
      {hasHeader ? (
        <header className="card__header">
          {icon !== undefined ? (
            <span className="card__icon" aria-hidden="true">
              {icon}
            </span>
          ) : null}
          <div className="card__heading">
            {title !== undefined ? (
              <h2 className="card__title" id={titleId}>
                {title}
              </h2>
            ) : null}
            {description !== undefined ? <p className="card__description">{description}</p> : null}
          </div>
          {actions !== undefined ? <div className="card__actions">{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </Tag>
  );
}
