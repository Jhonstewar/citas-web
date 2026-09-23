export interface BrandMarkProps {
  /** Lado del cuadrado en píxeles. El trazo se escala con él. */
  size?: number;
  className?: string;
}

/**
 * Marca de "FCV Citas": un corazón con la línea de pulso dentro y la cruz clínica sobre el
 * hombro derecho. En los mockups de Stitch el logo salía como un cuadro vacío, así que se
 * dibuja aquí en SVG y se hereda el color con `currentColor` para que sirva igual sobre el
 * panel azul (en blanco) que sobre superficie clara (en primario).
 */
export function BrandMark({ size = 28, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M16 27.5C16 27.5 5.5 21 5.5 13.9A5.9 5.9 0 0 1 16 10.3a5.9 5.9 0 0 1 10.5 3.6c0 1.4-.4 2.7-1.1 3.9" />
      <path d="M7 16.8h3.4l1.7-3.3 2.6 6.4 2-4.2 1.4 1.1h3.1" />
      <path d="M26.5 3.5v6M23.5 6.5h6" />
    </svg>
  );
}

export interface BrandLockupProps {
  /** `light` para el panel azul de marca; `dark` sobre superficies claras. */
  tone?: 'light' | 'dark';
  /** Muestra el nombre completo de la fundación bajo el nombre del producto. */
  withInstitution?: boolean;
  size?: number;
}

/**
 * Logo con texto: la marca más "FCV Citas". Es el bloque de identidad de las pantallas
 * públicas y de la barra lateral.
 */
export function BrandLockup({
  tone = 'dark',
  withInstitution = false,
  size = 28,
}: BrandLockupProps) {
  return (
    <span className={`brand brand--${tone}`}>
      <span className="brand__mark">
        <BrandMark size={size} />
      </span>
      <span className="brand__text">
        <span className="brand__name">FCV Citas</span>
        {withInstitution ? (
          <span className="brand__institution">Fundación Cardiovascular de Colombia</span>
        ) : null}
      </span>
    </span>
  );
}
