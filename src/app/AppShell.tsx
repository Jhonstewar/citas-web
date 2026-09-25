import { LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { DOCUMENT_TYPES, type Role } from '../api/contracts';
import { useCurrentUser } from '../auth/CurrentUserContext';
import { ROLE_LABEL } from '../auth/roles';
import { useSession } from '../auth/useSession';
import { BrandMark } from '../components/BrandLogo';
import { NAVIGATION } from './navigation';
import { useMediaQuery } from './useMediaQuery';

const ROLE_ORDER: readonly Role[] = ['ADMIN', 'PROFESSIONAL', 'USER'];

/** Mismo punto de corte que `app.css`: desde aquí la barra lateral es fija (no panel desplegable). */
export const DESKTOP_QUERY = '(min-width: 64rem)';

/** Preferencia de interfaz (no es dato de sesión): barra lateral oculta en escritorio. */
export const SIDEBAR_COLLAPSED_KEY = 'citas-web.sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    // Almacenamiento no disponible (modo privado, política del navegador): menú visible.
    return false;
  }
}

function writeCollapsed(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
  } catch {
    // Sin almacenamiento la preferencia vale solo para esta visita.
  }
}

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
 *
 * La hamburguesa alterna el menú: en escritorio oculta/muestra la barra fija (y recuerda la
 * preferencia); en pantallas estrechas abre/cierra el panel, que también se cierra con Esc, con
 * clic en el fondo y al navegar a otra ruta.
 */
export function AppShell() {
  const { user, fullName, roles, primaryRole } = useCurrentUser();
  const { signOut } = useSession();
  const navigate = useNavigate();
  const navId = useId();
  const isDesktop = useMediaQuery(DESKTOP_QUERY);
  // Escritorio: barra lateral fija que se puede ocultar (preferencia persistida).
  const [collapsed, setCollapsed] = useState(readCollapsed);
  // Pantallas estrechas: panel desplegable, cerrado al entrar.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  const [lastPath, setLastPath] = useState(pathname);

  // Navegar a otra ruta (enlace del menú, atrás/adelante) cierra el panel.
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (drawerOpen) setDrawerOpen(false);
  }
  // Al pasar a escritorio el panel desplegable deja de existir.
  if (isDesktop && drawerOpen) setDrawerOpen(false);

  const drawerVisible = !isDesktop && drawerOpen;
  const menuExpanded = isDesktop ? !collapsed : drawerOpen;

  // Foco: al abrir el panel va al primer enlace; al cerrarlo vuelve a la hamburguesa.
  const wasDrawerOpen = useRef(false);
  useEffect(() => {
    if (wasDrawerOpen.current === drawerOpen) return;
    wasDrawerOpen.current = drawerOpen;
    if (drawerOpen) {
      sidebarRef.current?.querySelector<HTMLElement>('.sidebar__link')?.focus();
    } else {
      menuButtonRef.current?.focus();
    }
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerVisible) return undefined;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerVisible]);

  function toggleMenu() {
    if (isDesktop) {
      const next = !collapsed;
      setCollapsed(next);
      writeCollapsed(next);
    } else {
      setDrawerOpen((open) => !open);
    }
  }

  function handleLogout() {
    signOut();
    void navigate('/login', { replace: true });
  }

  const visibleRoles = ROLE_ORDER.filter((role) => roles.includes(role));
  const showGroups = visibleRoles.length > 1;
  const documentType = DOCUMENT_TYPES.find((type) => type.code === user.documentType);

  let appClass = 'app';
  if (drawerVisible) appClass += ' app--menu-open';
  if (isDesktop && collapsed) appClass += ' app--sidebar-collapsed';

  return (
    <div className={appClass}>
      <a className="skip-link" href="#contenido">
        Saltar al contenido
      </a>

      <aside className="sidebar" id={navId} ref={sidebarRef} aria-label="Navegación principal">
        <div className="sidebar__brand">
          <span className="sidebar__logo" aria-hidden="true">
            <BrandMark size={22} />
          </span>
          <span>
            FCV Citas
            <span className="sidebar__brand-sub">HIC · ICV</span>
          </span>
        </div>

        {/*
         * Tarjeta de identidad: con qué rol y con qué documento estás viendo la aplicación.
         * El nombre no se repite aquí — vive en la cabecera, junto a "Cerrar sesión".
         */}
        <div className="sidebar__account">
          <p className="sidebar__account-role">
            <ShieldCheck size={14} aria-hidden="true" />
            {ROLE_LABEL[primaryRole]}
          </p>
          <p className="sidebar__account-doc">
            {documentType?.code ?? user.documentType} {user.documentNumber}
          </p>
        </div>

        <nav className="sidebar__nav">
          {visibleRoles.map((role) => (
            <div key={role} className="sidebar__group">
              <p className="sidebar__group-title">
                {showGroups ? ROLE_LABEL[role] : 'Menú principal'}
              </p>
              <ul className="sidebar__list">
                {NAVIGATION[role].map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.end === true}
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
        onClick={() => setDrawerOpen(false)}
      />

      <div className="app__main">
        <header className="topbar">
          <button
            ref={menuButtonRef}
            type="button"
            className="icon-button topbar__menu"
            aria-expanded={menuExpanded}
            aria-controls={navId}
            aria-label={menuExpanded ? 'Ocultar menú' : 'Mostrar menú'}
            onClick={toggleMenu}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <p className="topbar__brand">
            <BrandMark size={20} /> FCV Citas
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
