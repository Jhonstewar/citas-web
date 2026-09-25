import { ArrowRight } from 'lucide-react';
import type { TimeSlot } from '../../api/contracts';
import { formatShortDate } from '../../lib/dates';

function Side({ label, slot, proposed }: { label: string; slot: TimeSlot; proposed: boolean }) {
  return (
    <span className={proposed ? 'slot-change__side slot-change__side--proposed' : 'slot-change__side'}>
      <span className="slot-change__label">{label}</span>
      <span style={{ textTransform: 'capitalize' }}>{formatShortDate(slot.date)}</span>
      <span>
        {slot.startTime} – {slot.endTime}
      </span>
      <span className="person__meta">{slot.site.name}</span>
    </span>
  );
}

/**
 * Franja actual → propuesta de una reprogramación (HU-029 CA-04): fecha, horas y sede de cada
 * lado. La flecha es decorativa; las etiquetas "Actual" y "Propuesta" llevan el significado.
 */
export function SlotChange({ previous, proposed }: { previous: TimeSlot; proposed: TimeSlot }) {
  return (
    <span className="slot-change">
      <Side label="Actual" slot={previous} proposed={false} />
      <ArrowRight size={16} aria-hidden="true" className="slot-change__arrow" />
      <Side label="Propuesta" slot={proposed} proposed />
    </span>
  );
}
