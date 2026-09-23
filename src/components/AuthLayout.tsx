import { CalendarCheck, Hospital, ListChecks } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandLockup } from './BrandLogo';

export interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: ReactNode;
  /** Enlaces secundarios al pie de la tarjeta (registro, login, recuperación). */
  footer?: ReactNode;
  /** `wide` usa dos columnas de campos en escritorio (formulario de registro). */
  width?: 'narrow' | 'wide';
}

/**
 * Ventajas del panel de marca. Cada una describe algo que la aplicación hace de verdad:
 * el asistente de reserva, las dos sedes del catálogo y el seguimiento de estados.
 */
const HIGHLIGHTS = [
  {
    icon: CalendarCheck,
    title: 'Agenda en pocos pasos',
    description: 'Elige especialidad, sede, profesional y franja disponible.',
  },
  {
    icon: Hospital,
    title: 'Dos sedes',
    description: 'HIC Piedecuesta e ICV Floridablanca.',
  },
  {
    icon: ListChecks,
    title: 'Sigue el estado de tus citas',
    description: 'Las especializadas quedan en revisión hasta que un administrador las aprueba.',
  },
] as const;

/**
 * Marco de las pantallas públicas, según el diseño aprobado en Stitch: pantalla partida con
 * el panel de marca a la izquierda y el formulario a la derecha. En móvil el panel se reduce
 * a una cabecera compacta y el formulario queda arriba del pliegue.
 */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  width = 'narrow',
}: AuthLayoutProps) {
  return (
    <div className="auth">
      <aside className="auth__brand-panel">
        {/* Trazo de electrocardiograma: decorativo, muy bajo contraste, nunca informativo. */}
        <svg
          className="auth__ecg"
          viewBox="0 0 600 120"
          preserveAspectRatio="none"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M0 78h60l18-46 20 62 16-34 14 18h52l18-46 20 62 16-34 14 18h52l18-46 20 62 16-34 14 18h52l18-46 20 62 16-34 14 18h72"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>

        <div className="auth__brand-head">
          <BrandLockup tone="light" withInstitution size={30} />
        </div>

        <div className="auth__pitch">
          <p className="auth__eyebrow">Red hospitalaria · HIC e ICV</p>
          <p className="auth__headline">
            Tu salud cardiovascular, <em>a tiempo.</em>
          </p>
          <p className="auth__lead">
            Agenda y consulta tus citas en el Hospital Internacional de Colombia y el Instituto
            del Corazón.
          </p>
        </div>

        <ul className="auth__highlights">
          {HIGHLIGHTS.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.title} className="auth__highlight">
                <span className="auth__highlight-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <span>
                  <span className="auth__highlight-title">{item.title}</span>
                  <span className="auth__highlight-text">{item.description}</span>
                </span>
              </li>
            );
          })}
        </ul>

        <p className="auth__panel-foot">
          Entorno de laboratorio con datos ficticios. No registres información real de pacientes
          ni de profesionales.
        </p>
      </aside>

      <main className="auth__form-panel">
        <div className={`auth__card auth__card--${width}`}>
          <header className="auth__header">
            <BrandLockup size={26} />
            <h1 className="auth__title">{title}</h1>
            <p className="auth__subtitle">{subtitle}</p>
          </header>
          {children}
          {footer !== undefined ? <footer className="auth__footer">{footer}</footer> : null}
        </div>
        <p className="auth__disclaimer">Datos ficticios · Proyecto académico</p>
      </main>
    </div>
  );
}
