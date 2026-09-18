import type { AppointmentStatus } from '../api/contracts';

/** Etiquetas de respaldo si el backend no envía `statusName` (normalmente llega en español). */
export const STATUS_FALLBACK_LABEL: Readonly<Record<AppointmentStatus, string>> = {
  REQUESTED: 'Solicitada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Atendida',
  NO_SHOW: 'No asistió',
};

export function statusLabel(status: AppointmentStatus, statusName?: string | null): string {
  return statusName !== undefined && statusName !== null && statusName.trim() !== ''
    ? statusName
    : (STATUS_FALLBACK_LABEL[status] ?? status);
}
