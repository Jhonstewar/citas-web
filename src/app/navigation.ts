import {
  Building2,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  ClipboardList,
  House,
  Inbox,
  LayoutDashboard,
  Stethoscope,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '../api/contracts';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Solo activo en coincidencia exacta (inicios de rol). */
  end?: boolean;
}

/** Menú lateral por rol (HU-005 CA-08): cada sesión ve solo las rutas de su rol. */
export const NAVIGATION: Readonly<Record<Role, readonly NavItem[]>> = {
  USER: [
    { to: '/paciente', label: 'Inicio', icon: House, end: true },
    { to: '/paciente/agendar', label: 'Agendar cita', icon: CalendarPlus },
    { to: '/paciente/citas', label: 'Mis citas', icon: CalendarDays },
    { to: '/paciente/perfil', label: 'Mi perfil', icon: UserRound },
  ],
  PROFESSIONAL: [
    { to: '/profesional', label: 'Inicio', icon: House, end: true },
    { to: '/profesional/agenda', label: 'Mi agenda', icon: CalendarRange },
  ],
  ADMIN: [
    { to: '/admin', label: 'Panel', icon: LayoutDashboard, end: true },
    { to: '/admin/solicitudes', label: 'Solicitudes', icon: Inbox },
    { to: '/admin/profesionales', label: 'Profesionales', icon: Stethoscope },
    { to: '/admin/especialidades', label: 'Especialidades', icon: ClipboardList },
    { to: '/admin/eps', label: 'EPS y planes', icon: Building2 },
  ],
};
