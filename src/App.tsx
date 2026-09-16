import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { SessionProvider } from './auth/SessionProvider';
import { DashboardPlaceholderPage } from './pages/DashboardPlaceholderPage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { RecuperarPasswordPage } from './pages/RecuperarPasswordPage';
import { RegistroPage } from './pages/RegistroPage';

/**
 * Rutas de la aplicación.
 *
 * S2 cubre autenticación (RF-01, RF-02, RF-03). Las 17 pantallas obligatorias
 * del PRD §6 se documentan en `docs/diseno/PANTALLAS_OBLIGATORIAS.md` y se
 * añaden aquí conforme se implementen.
 */
export function App() {
  return (
    <SessionProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registro" element={<RegistroPage />} />
          <Route path="/recuperar-password" element={<RecuperarPasswordPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardPlaceholderPage />
              </RequireAuth>
            }
          />
          <Route path="/inicio" element={<Navigate to="/" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  );
}
