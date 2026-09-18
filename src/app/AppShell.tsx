import { HeartPulse, LogOut, Menu, X } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import type { Role } from '../api/contracts';
import { useCurrentUser } from '../auth/CurrentUserContext';
import { ROLE_LABEL } from '../auth/roles';
import { useSession } from '../auth/useSession';
import { NAVIGATION } from './navigation';

const ROLE_ORDER: readonly Role[] = ['ADMIN', 'PROFESSIONAL', 'USER'];

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Marco de la aplicación autenticada: barra lateral con la navegación del rol (en móvil, panel
 * desplegable), cabecera con el usuario y "Cerrar sesión", y el contenido de la ruta.
 */
export function AppShell() {
  const { fullName, roles, primaryRole } = useCurrentUser();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const navId = useId();

  useEffect(() => {
    if (!menuOpen) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  function handleLogout() {
    signOut();
    void navigate('/login', { replace: true });
  }

  const visibleRoles = ROLE_ORDER.filter((role) => roles.includes(role));
  const showGroups = visibleRoles.length > 1;

  return (
    <div className={menuOpen ? 'app app--menu-open' : 'app'}>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>

      <aside className="sidebar" id={navId} aria-label="Navegación principal">
        <div className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden="true">
            <HeartPulse size={20} />
          </span>
          <span>
            FCV Citas
            <span className="sidebar__brand-sub">{ROLE_LABEL[primaryRole]}</span>
          </span>
          <button
            type="button"
            className="icon-button sidebar__close"
            onClick={() => setMenuOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={20} aria-hidden="true" />
          </button>
        </div>
        <nav className="sidebar__nav">
          {visibleRoles.map((role) => (
            <div key={role} className="sidebar__group">
              {showGroups ? <p className="sidebar__group-title">{ROLE_LABEL[role]}</p> : null}
              <ul className="sidebar__list">
                {NAVIGATION[role].map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end === true}
                        onClick={() => setMenuOpen(false)}
                        className={({ isActive }) =>
                          isActive ? 'sidebar__link sidebar__link--active' : 'sidebar__link'
                        }
                      >
                        <Icon size={20} aria-hidden="true" />
                        {item.label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <p className="sidebar__foot">Laboratorio con datos ficticios.</p>
      </aside>

      <button
        type="button"
        className="app__scrim"
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => setMenuOpen(false)}
      />

      <div className="app__main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button topbar__menu"
            aria-expanded={menuOpen}
            aria-controls={navId}
            aria-label="Abrir menú"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <p className="topbar__brand">
            <HeartPulse size={18} aria-hidden="true" /> FCV Citas
          </p>
          <div className="topbar__user">
            <span className="avatar" aria-hidden="true">
              {initials(fullName)}
            </span>
            <span className="topbar__identity">
              <span className="topbar__name">{fullName}</span>
              <span className="topbar__role">{ROLE_LABEL[primaryRole]}</span>
            </span>
          </div>
          <button type="button" className="button button--ghost button--sm" onClick={handleLogout}>
            <LogOut size={16} aria-hidden="true" />
            <span className="topbar__logout-text">Cerrar sesión</span>
          </button>
        </header>
        <main className="content" id="contenido" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
