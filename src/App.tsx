import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router';
import { AppShell } from './app/AppShell';
import { CurrentUserProvider } from './auth/CurrentUserProvider';
import { RequireAuth } from './auth/RequireAuth';
import { RequireRole, RoleHomeRedirect } from './auth/RequireRole';
import { SessionProvider } from './auth/SessionProvider';
import { ToastProvider } from './components/ToastProvider';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { EpsDetailPage } from './pages/admin/EpsDetailPage';
import { EpsPage } from './pages/admin/EpsPage';
import { InboxPage } from './pages/admin/InboxPage';
import { ProfessionalCreatePage } from './pages/admin/ProfessionalCreatePage';
import { ProfessionalEditPage } from './pages/admin/ProfessionalEditPage';
import { ProfessionalsPage } from './pages/admin/ProfessionalsPage';
import { SpecialtiesPage } from './pages/admin/SpecialtiesPage';
import { LoginPage } from './pages/LoginPage';
import { InAppNotFoundPage, NotFoundPage } from './pages/NotFoundPage';
import { AppointmentDetailPage } from './pages/patient/AppointmentDetailPage';
import { BookingPage } from './pages/patient/booking/BookingPage';
import { MyAppointmentsPage } from './pages/patient/MyAppointmentsPage';
import { PatientHomePage } from './pages/patient/PatientHomePage';
import { ProfilePage } from './pages/patient/ProfilePage';
import { ReschedulePage } from './pages/patient/ReschedulePage';
import { AgendaPage } from './pages/professional/AgendaPage';
import { ProfessionalHomePage } from './pages/professional/ProfessionalHomePage';
import { RecuperarPasswordPage } from './pages/RecuperarPasswordPage';
import { RegistroPage } from './pages/RegistroPage';
import { RestablecerPasswordPage } from './pages/RestablecerPasswordPage';

/**
 * Rutas de la aplicación.
 *
 * Públicas: autenticación (RF-01..03). Protegidas: un marco común (`AppShell`) con la navegación
 * del rol y tres ramas por prefijo (HU-005 CA-08): `/paciente` (USER), `/profesional`
 * (PROFESSIONAL) y `/admin` (ADMIN). `/` lleva al inicio del rol; una rama de otro rol muestra
 * "Sin permiso" sin cerrar la sesión.
 */
export function App() {
  return (
    <SessionProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/registro" element={<RegistroPage />} />
            <Route path="/recuperar-password" element={<RecuperarPasswordPage />} />
            <Route path="/restablecer-password" element={<RestablecerPasswordPage />} />

            <Route
              element={
                <RequireAuth>
                  <CurrentUserProvider>
                    <AppShell />
                  </CurrentUserProvider>
                </RequireAuth>
              }
            >
              <Route index element={<RoleHomeRedirect />} />
              <Route path="inicio" element={<Navigate to="/" replace />} />

              <Route
                path="paciente"
                element={
                  <RequireRole role="USER">
                    <Outlet />
                  </RequireRole>
                }
              >
                <Route index element={<PatientHomePage />} />
                <Route path="agendar" element={<BookingPage />} />
                <Route path="citas" element={<MyAppointmentsPage />} />
                <Route path="citas/:id" element={<AppointmentDetailPage />} />
                <Route path="citas/:id/reprogramar" element={<ReschedulePage />} />
                <Route path="perfil" element={<ProfilePage />} />
                <Route path="*" element={<InAppNotFoundPage />} />
              </Route>

              <Route
                path="profesional"
                element={
                  <RequireRole role="PROFESSIONAL">
                    <Outlet />
                  </RequireRole>
                }
              >
                <Route index element={<ProfessionalHomePage />} />
                <Route path="agenda" element={<AgendaPage />} />
                <Route path="*" element={<InAppNotFoundPage />} />
              </Route>

              <Route
                path="admin"
                element={
                  <RequireRole role="ADMIN">
                    <Outlet />
                  </RequireRole>
                }
              >
                <Route index element={<AdminDashboardPage />} />
                <Route path="solicitudes" element={<InboxPage />} />
                <Route path="profesionales" element={<ProfessionalsPage />} />
                <Route path="profesionales/nuevo" element={<ProfessionalCreatePage />} />
                <Route path="profesionales/:id" element={<ProfessionalEditPage />} />
                <Route path="especialidades" element={<SpecialtiesPage />} />
                <Route path="eps" element={<EpsPage />} />
                <Route path="eps/:id" element={<EpsDetailPage />} />
                <Route path="*" element={<InAppNotFoundPage />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </SessionProvider>
  );
}
