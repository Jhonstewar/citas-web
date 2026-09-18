import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { IsoDate } from '../api/contracts';
import {
  formatDayNumber,
  formatLongDate,
  formatMonthShort,
  formatWeekday,
} from '../lib/dates';

export interface DateStripProps {
  label: string;
  days: readonly IsoDate[];
  selected: IsoDate | null;
  onSelect: (date: IsoDate) => void;
  /** Franjas por día; los días sin entrada o con 0 quedan deshabilitados como "sin cupo". */
  counts?: ReadonlyMap<IsoDate, number>;
  onPrevious?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  loading?: boolean;
}

/**
 * Tira de días para elegir fecha. Cada día muestra si tiene cupo con texto ("3 franjas" /
 * "Sin cupo"), no solo con color, y el día elegido se anuncia con `aria-pressed`.
 */
export function DateStrip({
  label,
  days,
  selected,
  onSelect,
  counts,
  onPrevious,
  onNext,
  loading = false,
}: DateStripProps) {
  return (
    <div className="date-strip" role="group" aria-label={label} aria-busy={loading}>
      {onPrevious !== undefined ? (
        <button
          type="button"
          className="icon-button date-strip__nav"
          onClick={onPrevious}
          aria-label="Días anteriores"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
      ) : null}
      <ul className="date-strip__list">
        {days.map((day) => {
          const count = counts?.get(day) ?? 0;
          const available = counts === undefined || count > 0;
          const isSelected = selected === day;
          const availability = counts === undefined ? '' : available ? `${count} ${count === 1 ? 'franja' : 'franjas'}` : 'Sin cupo';
          return (
            <li key={day}>
              <button
                type="button"
                className={[
                  'date-chip',
                  isSelected ? 'date-chip--selected' : '',
                  available ? 'date-chip--available' : 'date-chip--empty',
                ]
                  .filter(Boolean)
                  .join(' ')}
                aria-pressed={isSelected}
                aria-label={`${formatLongDate(day)}${availability !== '' ? `, ${availability}` : ''}`}
                disabled={!available || loading}
                onClick={() => onSelect(day)}
              >
                <span className="date-chip__weekday">{formatWeekday(day)}</span>
                <span className="date-chip__day">{formatDayNumber(day)}</span>
                <span className="date-chip__month">{formatMonthShort(day)}</span>
                {counts !== undefined ? (
                  <span className="date-chip__dot" aria-hidden="true" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {onNext !== undefined ? (
        <button
          type="button"
          className="icon-button date-strip__nav"
          onClick={onNext}
          aria-label="Días siguientes"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
