import {
  CalendarCheck,
  ClipboardList,
  Inbox,
  Stethoscope,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { getSummary } from '../../api/adminApi';
import type { AdminSummary } from '../../api/contracts';
import { Card } from '../../components/Card';
import { ErrorState } from '../../components/ErrorState';
import { PageHeader } from '../../components/PageHeader';
import { LoadingSection } from '../../components/Skeleton';
import { useResource } from '../../lib/useResource';

interface StatDef {
  key: keyof AdminSummary;
  label: string;
  icon: LucideIcon;
  tone: '' | 'accent' | 'warning' | 'success';
  to: string;
}

const STATS: readonly StatDef[] = [
  { key: 'pendingRequests', label: 'Solicitudes pendientes', icon: Inbox, tone: 'warning', to: '/admin/solicitudes' },
  { key: 'activeProfessionals', label: 'Profesionales activos', icon: Stethoscope, tone: '', to: '/admin/profesionales' },
  { key: 'activeSpecialties', label: 'Especialidades activas', icon: ClipboardList, tone: 'accent', to: '/admin/especialidades' },
  { key: 'appointmentsToday', label: 'Citas de hoy', icon: CalendarCheck, tone: 'success', to: '/admin/solicitudes' },
];

/** Panel del administrador: contadores de `/api/admin/summary` y accesos directos. */
export function AdminDashboardPage() {
  const summary = useResource((signal) => getSummary(signal), []);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Administración"
        title="Panel"
        description="Lo que requiere tu atención hoy y accesos a la gestión del sistema."
      />

      {summary.state.status === 'loading' ? (
        <LoadingSection label="Cargando indicadores…" count={4} />
      ) : null}
      {summary.state.status === 'error' ? (
        <ErrorState error={summary.state.error} onRetry={() => summary.reload()} />
      ) : null}
      {summary.state.status === 'ready' ? (
        <ul className="grid grid--4" style={{ listStyle: 'none' }}>
          {STATS.map((stat) => {
            const Icon = stat.icon;
            const data = summary.state.status === 'ready' ? summary.state.data : null;
            return (
              <li key={stat.key}>
                <Link className="card card--tight stat" to={stat.to}>
                  <span
                    className={stat.tone === '' ? 'stat__icon' : `stat__icon stat__icon--${stat.tone}`}
                    aria-hidden="true"
                  >
                    <Icon size={22} />
                  </span>
                  <span className="stack stack--sm" style={{ gap: 4 }}>
                    <span className="stat__value">{data?.[stat.key] ?? 0}</span>
                    <span className="stat__label">{stat.label}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : null}

      <Card title="Accesos directos">
        <div className="grid grid--3">
          <Link className="button button--primary button--link" to="/admin/solicitudes">
            <Inbox size={18} aria-hidden="true" />
            Revisar solicitudes
          </Link>
          <Link className="button button--ghost button--link" to="/admin/profesionales/nuevo">
            <UserPlus size={18} aria-hidden="true" />
            Nuevo profesional
          </Link>
          <Link className="button button--ghost button--link" to="/admin/especialidades">
            <ClipboardList size={18} aria-hidden="true" />
            Gestionar especialidades
          </Link>
        </div>
      </Card>
    </div>
  );
}
