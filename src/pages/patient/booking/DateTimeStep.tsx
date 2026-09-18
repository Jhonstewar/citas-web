import { CalendarX, MapPin, Stethoscope, Timer } from 'lucide-react';
import { useMemo } from 'react';
import type { IsoDate, Offer } from '../../../api/contracts';
import { availabilityDays, offerCount, searchAvailability } from '../../../api/patientApi';
import { DateStrip } from '../../../components/DateStrip';
import { EmptyState } from '../../../components/EmptyState';
import { ErrorState } from '../../../components/ErrorState';
import { LoadingSection, Skeleton } from '../../../components/Skeleton';
import { addDays, daysBetween, formatLongDate, todayIso } from '../../../lib/dates';
import { useResource } from '../../../lib/useResource';
import { sameOffer, WINDOW_DAYS } from './offers';

export interface DateTimeStepProps {
  specialtyId: number;
  siteId: number | null;
  windowStart: IsoDate;
  onWindowChange: (start: IsoDate) => void;
  /** Día elegido por el usuario; si no tiene cupo se usa el primero que sí tenga. */
  date: IsoDate | null;
  onDateChange: (date: IsoDate) => void;
  professionalId: number | null;
  onProfessionalChange: (id: number | null) => void;
  selected: Offer | null;
  onSelect: (offer: Offer) => void;
  /** Cambia para forzar la recarga (p. ej. tras un 409 SLOT_TAKEN). */
  reloadKey: number;
}

/**
 * Paso "Fecha y hora": tira de 14 días con los días que tienen cupo (`/availability/days`) y,
 * para el día elegido, las franjas agrupadas por profesional y sede (`/availability`).
 * Buscar no retiene nada (HU-022 CA-08): la franja solo se reserva al confirmar.
 */
export function DateTimeStep({
  specialtyId,
  siteId,
  windowStart,
  onWindowChange,
  date,
  onDateChange,
  professionalId,
  onProfessionalChange,
  selected,
  onSelect,
  reloadKey,
}: DateTimeStepProps) {
  const today = todayIso();
  const windowEnd = addDays(windowStart, WINDOW_DAYS - 1);
  const siteFilter = siteId ?? undefined;

  const days = useResource(
    (signal) =>
      availabilityDays({ specialtyId, from: windowStart, to: windowEnd, siteId: siteFilter }, signal),
    [specialtyId, siteFilter, windowStart, windowEnd, reloadKey],
  );

  const counts = useMemo(() => {
    const map = new Map<IsoDate, number>();
    if (days.state.status === 'ready') {
      for (const day of days.state.data) {
        const count = offerCount(day);
        if (count > 0) map.set(day.date, count);
      }
    }
    return map;
  }, [days.state]);

  const firstAvailable = [...counts.keys()].sort()[0] ?? null;
  const effectiveDate = date !== null && counts.has(date) ? date : firstAvailable;

  const offers = useResource(
    (signal) =>
      effectiveDate === null
        ? Promise.resolve<Offer[]>([])
        : searchAvailability({ specialtyId, date: effectiveDate, siteId: siteFilter }, signal),
    [specialtyId, siteFilter, effectiveDate, reloadKey],
  );

  const stripDays = daysBetween(windowStart, windowEnd);

  return (
    <div className="stack stack--lg">
      <div className="stack stack--sm">
        <h3 className="card__title">Elige el día</h3>
        <p className="muted text-sm">
          Los días con punto tienen horarios disponibles. Los atenuados no tienen cupo.
        </p>
        {days.state.status === 'error' ? (
          <ErrorState compact error={days.state.error} onRetry={() => days.reload()} />
        ) : (
          <DateStrip
            label="Días disponibles"
            days={stripDays}
            selected={effectiveDate}
            counts={counts}
            loading={days.state.status === 'loading'}
            onSelect={onDateChange}
            onPrevious={
              windowStart > today ? () => onWindowChange(addDays(windowStart, -WINDOW_DAYS)) : undefined
            }
            onNext={() => onWindowChange(addDays(windowStart, WINDOW_DAYS))}
          />
        )}
      </div>

      {days.state.status === 'loading' ? <LoadingSection label="Buscando días con cupo…" count={2} /> : null}

      {days.state.status === 'ready' && effectiveDate === null ? (
        <EmptyState
          compact
          icon={<CalendarX size={32} />}
          title="No hay horarios en estos 14 días"
          description="Prueba con los días siguientes o cambia la sede en el paso anterior."
          action={
            <button
              type="button"
              className="button button--ghost"
              onClick={() => onWindowChange(addDays(windowStart, WINDOW_DAYS))}
            >
              Ver los 14 días siguientes
            </button>
          }
        />
      ) : null}

      {effectiveDate !== null ? (
        <section className="stack" aria-labelledby="franjas-titulo" aria-busy={offers.state.status === 'loading'}>
          <h3 className="card__title" id="franjas-titulo">
            Horarios del {formatLongDate(effectiveDate)}
          </h3>
          {offers.state.status === 'loading' ? (
            <div role="status">
              <span className="visually-hidden">Cargando horarios…</span>
              <Skeleton variant="row" count={3} />
            </div>
          ) : null}
          {offers.state.status === 'error' ? (
            <ErrorState compact error={offers.state.error} onRetry={() => offers.reload()} />
          ) : null}
          {offers.state.status === 'ready' ? (
            <OfferGroups
              offers={offers.state.data}
              professionalId={professionalId}
              onProfessionalChange={onProfessionalChange}
              selected={selected}
              onSelect={onSelect}
            />
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function OfferGroups({
  offers,
  professionalId,
  onProfessionalChange,
  selected,
  onSelect,
}: {
  offers: readonly Offer[];
  professionalId: number | null;
  onProfessionalChange: (id: number | null) => void;
  selected: Offer | null;
  onSelect: (offer: Offer) => void;
}) {
  // Los profesionales del filtro salen de la propia oferta: el contrato no expone al USER un
  // listado de profesionales por especialidad.
  const professionals = [...new Map(offers.map((offer) => [offer.professional.id, offer.professional])).values()];
  const visible =
    professionalId === null ? offers : offers.filter((offer) => offer.professional.id === professionalId);

  const groups = new Map<string, Offer[]>();
  for (const offer of visible) {
    const key = `${offer.professional.id}|${offer.site.id}`;
    groups.set(key, [...(groups.get(key) ?? []), offer]);
  }

  if (offers.length === 0) {
    return (
      <EmptyState
        compact
        icon={<CalendarX size={32} />}
        title="Este día ya no tiene horarios"
        description="Elige otro día de la tira."
      />
    );
  }

  return (
    <div className="stack">
      {professionals.length > 1 || professionalId !== null ? (
        <div className="stack stack--sm">
          <p className="field__label" id="filtro-profesional">
            Profesional
          </p>
          <div className="chips" role="group" aria-labelledby="filtro-profesional">
            <button
              type="button"
              className="chip"
              aria-pressed={professionalId === null}
              onClick={() => onProfessionalChange(null)}
            >
              Cualquiera
            </button>
            {professionals.map((professional) => (
              <button
                key={professional.id}
                type="button"
                className="chip"
                aria-pressed={professionalId === professional.id}
                onClick={() => onProfessionalChange(professional.id)}
              >
                {professional.fullName}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          compact
          icon={<CalendarX size={32} />}
          title="Este profesional no tiene horarios ese día"
          description="Elige otro profesional o “Cualquiera”."
          action={
            <button type="button" className="button button--ghost" onClick={() => onProfessionalChange(null)}>
              Ver todos los profesionales
            </button>
          }
        />
      ) : null}

      {[...groups.entries()].map(([key, group]) => {
        const first = group[0] as Offer;
        const titleId = `grupo-${key.replace('|', '-')}`;
        return (
          <section key={key} className="slot-group" aria-labelledby={titleId}>
            <h4 className="slot-group__title" id={titleId}>
              <Stethoscope size={18} aria-hidden="true" />
              {first.professional.fullName}
              <span className="badge badge--neutral">
                <MapPin size={12} aria-hidden="true" />
                {first.site.name}
              </span>
              <span className="badge badge--info">
                <Timer size={12} aria-hidden="true" />
                {first.durationMinutes} min
              </span>
            </h4>
            <ul className="time-chips">
              {group.map((offer) => (
                <li key={offer.startTime}>
                  <button
                    type="button"
                    className="time-chip"
                    aria-pressed={sameOffer(selected, offer)}
                    aria-label={`${offer.startTime} a ${offer.endTime} con ${offer.professional.fullName} en ${offer.site.name}`}
                    onClick={() => onSelect(offer)}
                  >
                    {offer.startTime}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
