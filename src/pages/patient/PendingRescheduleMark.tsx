import { Hourglass } from 'lucide-react';
import type { Appointment } from '../../api/contracts';

/**
 * HU-028 · Marca "Reprogramación pendiente" de las tarjetas de cita del paciente. Sale del
 * `pendingReschedule` que calcula el backend; icono + texto, nunca solo color.
 */
export function PendingRescheduleMark({ appointment }: { appointment: Appointment }) {
  if (!appointment.pendingReschedule) return null;
  return (
    <span className="appointment__meta">
      <span className="badge badge--warning">
        <Hourglass size={12} aria-hidden="true" />
        Reprogramación pendiente
      </span>
    </span>
  );
}
