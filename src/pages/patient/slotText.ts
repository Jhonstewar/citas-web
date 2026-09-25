import type { TimeSlot } from '../../api/contracts';
import { formatLongDate } from '../../lib/dates';

/** Franja legible: "jueves, 1 de octubre de 2099, 09:00 – 10:00 · Instituto del Corazón". */
export function slotText(slot: TimeSlot): string {
  return `${formatLongDate(slot.date)}, ${slot.startTime} – ${slot.endTime} · ${slot.site.name}`;
}
