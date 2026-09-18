import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

export interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  /** Texto pequeño sobre el título (sección o contexto). */
  eyebrow?: string;
  actions?: ReactNode;
  back?: { to: string; label: string };
}

/** Cabecera de pantalla: un único `h1`, descripción y acción principal. */
export function PageHeader({ title, description, eyebrow, actions, back }: PageHeaderProps) {
  return (
    <header className="page-header">
      {back !== undefined ? (
        <Link className="page-header__back" to={back.to}>
          <ArrowLeft size={16} aria-hidden="true" />
          {back.label}
        </Link>
      ) : null}
      <div className="page-header__row">
        <div className="page-header__text">
          {eyebrow !== undefined ? <p className="page-header__eyebrow">{eyebrow}</p> : null}
          <h1 className="page-header__title">{title}</h1>
          {description !== undefined ? (
            <p className="page-header__description">{description}</p>
          ) : null}
        </div>
        {actions !== undefined ? <div className="page-header__actions">{actions}</div> : null}
      </div>
    </header>
  );
}
