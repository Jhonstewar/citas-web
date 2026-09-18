import type { HourMinute, IsoDate } from '../api/contracts';

/**
 * Fechas del contrato: `2026-09-21` y `08:30`, sin zona, referidas a America/Bogota.
 *
 * Para no depender de la zona del navegador, las fechas ISO se manejan como días de calendario
 * (a medianoche UTC) y "hoy" se calcula en la zona del sistema. Nada de esto decide reglas de
 * negocio: el backend rechaza el pasado por su cuenta; aquí solo se presenta.
 */
export const APP_TIME_ZONE = 'America/Bogota';
const LOCALE = 'es-CO';

function toUtcDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUtcDate(value: Date): IsoDate {
  return value.toISOString().slice(0, 10);
}

/** Fecha de hoy en Bogotá. */
export function todayIso(now: Date = new Date()): IsoDate {
  // `en-CA` formatea como AAAA-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Hora actual en Bogotá, `HH:mm`. */
export function nowTime(now: Date = new Date()): HourMinute {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: APP_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const value = toUtcDate(date);
  value.setUTCDate(value.getUTCDate() + days);
  return fromUtcDate(value);
}

/** Lunes de la semana de `date`. */
export function startOfWeek(date: IsoDate): IsoDate {
  const weekday = toUtcDate(date).getUTCDay(); // 0 = domingo
  return addDays(date, weekday === 0 ? -6 : 1 - weekday);
}

export function daysBetween(from: IsoDate, to: IsoDate): IsoDate[] {
  const result: IsoDate[] = [];
  for (let current = from; current <= to; current = addDays(current, 1)) result.push(current);
  return result;
}

function format(date: IsoDate, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone: 'UTC' }).format(toUtcDate(date));
}

/** «martes, 22 de septiembre de 2026». */
export function formatLongDate(date: IsoDate): string {
  return format(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/** «mar, 22 sept». */
export function formatShortDate(date: IsoDate): string {
  return format(date, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** «mar». */
export function formatWeekday(date: IsoDate): string {
  return format(date, { weekday: 'short' }).replace('.', '');
}

/** «22». */
export function formatDayNumber(date: IsoDate): string {
  return String(toUtcDate(date).getUTCDate());
}

/** «sept». */
export function formatMonthShort(date: IsoDate): string {
  return format(date, { month: 'short' }).replace('.', '');
}

/** «22 sept – 28 sept 2026». */
export function formatRange(from: IsoDate, to: IsoDate): string {
  return `${format(from, { day: 'numeric', month: 'short' })} – ${format(to, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })}`;
}

/** Fecha y hora de un instante ISO (historial), en la zona del sistema. */
export function formatDateTime(instant: string): string {
  const value = new Date(instant);
  if (Number.isNaN(value.getTime())) return instant;
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: APP_TIME_ZONE,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value);
}

export function toMinutes(time: HourMinute): number {
  const [hours = '0', minutes = '0'] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

export function fromMinutes(total: number): HourMinute {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Horas de la rejilla de 30 min entre `from` y `to` (ambas incluidas). */
export function halfHourGrid(from: HourMinute, to: HourMinute): HourMinute[] {
  const result: HourMinute[] = [];
  for (let minute = toMinutes(from); minute <= toMinutes(to); minute += 30) {
    result.push(fromMinutes(minute));
  }
  return result;
}

/** ¿`date` + `time` es posterior a este momento en Bogotá? Solo para presentar. */
export function isUpcoming(date: IsoDate, time: HourMinute, now: Date = new Date()): boolean {
  const today = todayIso(now);
  if (date !== today) return date > today;
  return time >= nowTime(now);
}
