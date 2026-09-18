import { CalendarRange, CircleCheck, Layers, MapPin, Star, Stethoscope, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { getMyProfile, listBlocks } from '../../api/professionalApi';
import { useCurrentUser } from '../../auth/CurrentUserContext';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { Badge } from '../../components/StatusBadge';
import { addDays, formatRange, startOfWeek, todayIso } from '../../lib/dates';
import { useResource } from '../../lib/useResource';

/** Inicio del profesional: sus sedes y especialidades, y el resumen de bloques de la semana. */
export function ProfessionalHomePage() {
  const { user } = useCurrentUser();
  const monday = startOfWeek(todayIso());
  const sunday = addDays(monday, 6);
  const profile = useResource((signal) => getMyProfile(signal), []);
  const week = useResource((signal) => listBlocks(monday, sunday, signal), [monday, sunday]);

  const slots = week.state.status === 'ready' ? week.state.data.flatMap((block) => block.slots) : [];
  const free = slots.filter((slot) => slot.available).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Profesional"
        title={`Hola, ${user.firstNames}`}
        description="Tu semana de un vistazo. Publica bloques de disponibilidad para que los pacientes puedan reservar."
        actions={
          <Link className="button button--primary button--link" to="/profesional/agenda">
            <CalendarRange size={18} aria-hidden="true" />
            Gestionar agenda
          </Link>
        }
      />

      <section aria-labelledby="resumen-semana" className="stack">
        <h2 className="card__title" id="resumen-semana">
          Semana del {formatRange(monday, sunday)}
        </h2>
        {week.state.status === 'loading' ? (
          <LoadingSection label="Cargando el resumen de la semana…" count={3} />
        ) : null}
        {week.state.status === 'error' ? (
          <ErrorState compact error={week.state.error} onRetry={() => week.reload()} />
        ) : null}
        {week.state.status === 'ready' ? (
          <div className="grid grid--3">
            <div className="card card--tight stat">
              <span className="stat__icon" aria-hidden="true">
                <Layers size={22} />
              </span>
              <span>
                <span className="stat__value">{week.state.data.length}</span>
                <span className="stat__label"> bloques esta semana</span>
              </span>
            </div>
            <div className="card card--tight stat">
              <span className="stat__icon stat__icon--success" aria-hidden="true">
                <CircleCheck size={22} />
              </span>
              <span>
                <span className="stat__value">{free}</span>
                <span className="stat__label"> franjas libres</span>
              </span>
            </div>
            <div className="card card--tight stat">
              <span className="stat__icon stat__icon--warning" aria-hidden="true">
                <UserRound size={22} />
              </span>
              <span>
                <span className="stat__value">{slots.length - free}</span>
                <span className="stat__label"> franjas ocupadas</span>
              </span>
            </div>
          </div>
        ) : null}
      </section>

      <Card title="Tu perfil profesional" icon={<Stethoscope size={20} />}>
        {profile.state.status === 'loading' ? <LoadingSection count={1} variant="text" /> : null}
        {profile.state.status === 'error' ? (
          <ErrorState compact error={profile.state.error} onRetry={() => profile.reload()} />
        ) : null}
        {profile.state.status === 'ready' ? (
          <div className="grid grid--2">
            <div className="stack stack--sm">
              <h3 className="text-sm muted">Especialidades</h3>
              <div className="cluster">
                {profile.state.data.specialties.map((specialty) => (
                  <Badge
                    key={specialty.id}
                    tone={specialty.primary ? 'info' : 'neutral'}
                    icon={specialty.primary ? <Star size={12} aria-hidden="true" /> : undefined}
                  >
                    {specialty.name}
                    {specialty.primary ? ' (principal)' : ''}
                  </Badge>
                ))}
              </div>
            </div>
            <div className="stack stack--sm">
              <h3 className="text-sm muted">Sedes asignadas</h3>
              <div className="cluster">
                {profile.state.data.sites.map((site) => (
                  <Badge key={site.id} tone="neutral" icon={<MapPin size={12} aria-hidden="true" />}>
                    {site.name}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
