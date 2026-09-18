import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

/** Estado vacío ilustrado: explica por qué no hay nada y qué hacer a continuación. */
export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={compact ? 'empty empty--compact' : 'empty'} role="status">
      <span className="empty__icon" aria-hidden="true">
        {icon}
      </span>
      <p className="empty__title">{title}</p>
      {description !== undefined ? <p className="empty__description">{description}</p> : null}
      {action !== undefined ? <div className="empty__action">{action}</div> : null}
    </div>
  );
}
