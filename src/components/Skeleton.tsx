export interface SkeletonProps {
  variant?: 'text' | 'block' | 'card' | 'row';
  lines?: number;
  count?: number;
}

/** Marcador de carga con la forma aproximada del contenido. Decorativo para lectores de pantalla. */
export function Skeleton({ variant = 'text', lines = 1, count = 1 }: SkeletonProps) {
  const items = Array.from({ length: count }, (_, index) => index);
  return (
    <div className={`skeleton-group skeleton-group--${variant}`} aria-hidden="true">
      {items.map((item) =>
        variant === 'text' ? (
          <div key={item} className="skeleton-lines">
            {Array.from({ length: lines }, (_, line) => (
              <span
                key={line}
                className="skeleton skeleton--text"
                style={{ width: line === lines - 1 && lines > 1 ? '60%' : '100%' }}
              />
            ))}
          </div>
        ) : (
          <span key={item} className={`skeleton skeleton--${variant}`} />
        ),
      )}
    </div>
  );
}

/** Carga de una sección: esqueleto visible y texto para lectores de pantalla. */
export function LoadingSection({
  label = 'Cargando…',
  variant = 'card',
  count = 3,
}: {
  label?: string;
  variant?: SkeletonProps['variant'];
  count?: number;
}) {
  return (
    <div role="status" aria-live="polite" className="loading-section">
      <span className="visually-hidden">{label}</span>
      <Skeleton variant={variant} count={count} />
    </div>
  );
}
