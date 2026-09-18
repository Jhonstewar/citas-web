import { Clock, MapPin, Stethoscope, Timer } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import type { Appointment } from '../api/contracts';
import { formatDayNumber, formatLongDate, formatMonthShort, formatWeekday } from '../lib/dates';
import { StatusBadge } from './StatusBadge';

/** Bloque de fecha grande (día y mes) de las tarjetas de cita. */
export function DateBlock({ date }: { date: string }) {
  return (
    <span className="date-block" aria-hidden="true">
      <span className="date-block__month">{formatWeekday(date)}</span>
      <span className="date-block__day">{formatDayNumber(date)}</span>
      <span className="date-block__month">{formatMonthShort(date)}</span>
    </span>
  );
}

/**
 * Resumen de una cita: fecha, hora, especialidad, profesional, sede, duración y estado.
 * Con `to` es un enlace al detalle.
 */
export function AppointmentCard({
  appointment,
  to,
  footer,
}: {
  appointment: Appointment;
  to?: string;
  footer?: ReactNode;
}) {
  const content = (
    <>
      <DateBlock date={appointment.date} />
      <span className="appointment__body">
        <span className="appointment__top">
          <span className="appointment__title">{appointment.specialty.name}</span>
          <StatusBadge status={appointment.status} statusName={appointment.statusName} />
        </span>
        <span className="visually-hidden">{formatLongDate(appointment.date)}</span>
        <span className="appointment__meta">
          <span>
            <Clock size={14} aria-hidden="true" />
            {appointment.startTime} – {appointment.endTime}
          </span>
          <span>
            <Timer size={14} aria-hidden="true" />
            {appointment.durationMinutes} min
          </span>
        </span>
        <span className="appointment__meta">
          <span>
            <Stethoscope size={14} aria-hidden="true" />
            {appointment.professional.fullName}
          </span>
          <span>
            <MapPin size={14} aria-hidden="true" />
            {appointment.site.name}
          </span>
        </span>
        {footer}
      </span>
    </>
  );

  if (to !== undefined) {
    return (
      <Link className="appointment" to={to}>
        {content}
      </Link>
    );
  }
  return <div className="appointment">{content}</div>;
}
