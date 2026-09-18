import {
  Ban,
  BadgeCheck,
  CalendarX,
  CircleCheck,
  CircleX,
  Hourglass,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { AppointmentStatus } from '../api/contracts';
import { statusLabel } from '../lib/status';

const STATUS_ICON: Readonly<Record<AppointmentStatus, LucideIcon>> = {
  REQUESTED: Hourglass,
  APPROVED: CircleCheck,
  REJECTED: CircleX,
  CANCELLED: Ban,
  COMPLETED: BadgeCheck,
  NO_SHOW: CalendarX,
};

/**
 * Estado de una cita con color, icono y texto: el color nunca es el único portador del estado.
 * La etiqueta preferida es `statusName`, que llega del backend en español.
 */
export function StatusBadge({
  status,
  statusName,
}: {
  status: AppointmentStatus;
  statusName?: string;
}) {
  const Icon = STATUS_ICON[status] ?? Hourglass;
  return (
    <span className={`badge badge--status-${status.toLowerCase()}`}>
      <Icon size={14} aria-hidden="true" />
      {statusLabel(status, statusName)}
    </span>
  );
}

export type BadgeTone = 'neutral' | 'success' | 'danger' | 'warning' | 'info';

/** Insignia genérica (activo/inactivo, tipo de cita, sede…). */
export function Badge({
  tone = 'neutral',
  icon,
  children,
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {icon}
      {children}
    </span>
  );
}
