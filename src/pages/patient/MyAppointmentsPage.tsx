import { CalendarPlus, CalendarSearch, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { getAppointmentStatuses } from '../../api/catalogApi';
import type { AppointmentStatus } from '../../api/contracts';
import { listMyAppointments } from '../../api/patientApi';
import { AppointmentCard } from '../../components/AppointmentCard';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { useResource } from '../../lib/useResource';
import { PendingRescheduleMark } from './PendingRescheduleMark';

/**
 * Mis citas (HU-025): filtros por estado y fecha aplicados por el backend. Los estados del filtro
 * salen del catálogo de la API (HU-010 CA-08). Los filtros viven en la URL, así que volver del
 * detalle conserva la búsqueda.
 */
export function MyAppointmentsPage() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('estado') ?? '') as AppointmentStatus | '';
  const date = params.get('fecha') ?? '';

  const statuses = useResource((signal) => getAppointmentStatuses(signal), []);
  const appointments = useResource(
    (signal) =>
      listMyAppointments(
        { status: status === '' ? undefined : status, date: date === '' ? undefined : date },
        signal,
      ),
    [status, date],
  );

  function setFilter(key: 'estado' | 'fecha', value: string) {
    const next = new URLSearchParams(params);
    if (value === '') next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true });
  }

  const hasFilters = status !== '' || date !== '';

  return (
    <div className="page">
      <PageHeader
        eyebrow="Paciente"
        title="Mis citas"
        description="Consulta tus citas y solicitudes. Abre una para ver su detalle e historial."
        actions={
          <Link className="button button--primary button--link" to="/paciente/agendar">
            <CalendarPlus size={18} aria-hidden="true" />
            Agendar cita
          </Link>
        }
      />

      <section className="filters" aria-label="Filtros">
        <div className="stack stack--sm" style={{ gridColumn: '1 / -1' }}>
          <p className="field__label" id="filtro-estado">
            Estado
          </p>
          <div className="chips" role="group" aria-labelledby="filtro-estado">
            <button
              type="button"
              className="chip"
              aria-pressed={status === ''}
              onClick={() => setFilter('estado', '')}
            >
              Todas
            </button>
            {statuses.state.status === 'ready'
              ? statuses.state.data.map((item) => (
                  <button
                    key={item.code}
                    type="button"
                    className="chip"
                    aria-pressed={status === item.code}
                    onClick={() => setFilter('estado', item.code)}
                  >
                    {item.name}
                  </button>
                ))
              : null}
          </div>
          {statuses.state.status === 'error' ? (
            <p className="field__hint">No se pudieron cargar los estados: {statuses.state.error.message}</p>
          ) : null}
        </div>
        <div className="field">
          <label className="field__label" htmlFor="filtro-fecha">
            Fecha
          </label>
          <input
            id="filtro-fecha"
            className="field__input"
            type="date"
            value={date}
            onChange={(event) => setFilter('fecha', event.target.value)}
          />
        </div>
        {hasFilters ? (
          <div>
            <button type="button" className="button button--ghost" onClick={() => setParams({}, { replace: true })}>
              <X size={16} aria-hidden="true" />
              Limpiar filtros
            </button>
          </div>
        ) : null}
      </section>

      <section aria-label="Resultados" aria-busy={appointments.state.status === 'loading'}>
        {appointments.state.status === 'loading' ? <LoadingSection label="Cargando tus citas…" /> : null}
        {appointments.state.status === 'error' ? (
          <ErrorState error={appointments.state.error} onRetry={() => appointments.reload()} />
        ) : null}
        {appointments.state.status === 'ready' && appointments.state.data.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={<CalendarSearch size={36} />}
              title="No hay citas con estos filtros"
              description="Prueba con otro estado u otra fecha."
              action={
                <button type="button" className="button button--ghost" onClick={() => setParams({}, { replace: true })}>
                  Limpiar filtros
                </button>
              }
            />
          ) : (
            <EmptyState
              icon={<CalendarPlus size={36} />}
              title="Aún no tienes citas"
              description="Agenda tu primera cita en pocos pasos."
              action={
                <Link className="button button--primary button--link" to="/paciente/agendar">
                  Agendar cita
                </Link>
              }
            />
          )
        ) : null}
        {appointments.state.status === 'ready' && appointments.state.data.length > 0 ? (
          <ul className="appointment-list">
            {appointments.state.data.map((item) => (
              <li key={item.id}>
                <AppointmentCard
                  appointment={item}
                  to={`/paciente/citas/${item.id}`}
                  footer={<PendingRescheduleMark appointment={item} />}
                />
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
