import type { Offer } from '../../../api/contracts';

/** Días que muestra la tira de fechas del asistente. */
export const WINDOW_DAYS = 14;

function offerKey(offer: Offer): string {
  return `${offer.professional.id}|${offer.site.id}|${offer.date}|${offer.startTime}`;
}

/** Misma franja: mismo profesional, sede, fecha y hora de inicio. */
export function sameOffer(a: Offer | null, b: Offer | null): boolean {
  return a !== null && b !== null && offerKey(a) === offerKey(b);
}
