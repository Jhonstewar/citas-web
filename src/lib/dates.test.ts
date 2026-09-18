import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setTimeZone } from '../test/timeZone';
import { formatDateTime, parseBogotaDateTime } from './dates';

/**
 * El backend envía `createdAt`/`changedAt` como LocalDateTime SIN zona, en hora de Bogotá
 * (`2026-09-20T23:30:00`, a veces con fracción `.123456`). La UI debe mostrar esa misma hora
 * aunque el navegador esté en otra zona.
 */

let restore: () => void = () => undefined;

beforeEach(() => {
  restore = setTimeZone('Asia/Tokyo');
});

afterEach(() => {
  restore();
});

describe('fechas y horas del backend (LocalDateTime de Bogotá)', () => {
  it('interpreta la hora sin zona como hora de Bogotá (UTC-5), con el navegador en Tokio', () => {
    expect(parseBogotaDateTime('2026-09-20T23:30:00')?.toISOString()).toBe('2026-09-21T04:30:00.000Z');
    expect(formatDateTime('2026-09-20T23:30:00')).toBe('20 de sept de 2026, 23:30');
  });

  it('admite fracción de segundos y minutos sin segundos', () => {
    expect(formatDateTime('2026-09-21T08:05:07.123456')).toBe('21 de sept de 2026, 08:05');
    expect(formatDateTime('2026-09-21T08:05')).toBe('21 de sept de 2026, 08:05');
  });

  it('un instante con zona explícita se respeta y se muestra en hora de Bogotá', () => {
    expect(formatDateTime('2026-09-21T13:00:00Z')).toBe('21 de sept de 2026, 08:00');
  });

  it('un texto no reconocible se muestra tal cual', () => {
    expect(parseBogotaDateTime('ayer')).toBeNull();
    expect(formatDateTime('ayer')).toBe('ayer');
  });
});
