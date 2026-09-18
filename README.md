# citas-web

Frontend del laboratorio **FCV Citas**: React + TypeScript + Vite, consumiendo
directamente la API REST de Spring Boot de `citas-api`. **Sin Express y sin BFF.**

## Puesta en marcha

```bash
npm install
cp .env.example .env    # ajusta VITE_API_URL si el backend no está en localhost:8080
npm run dev
```

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo de Vite |
| `npm run build` | `tsc -b` + build de producción |
| `npm run typecheck` | Solo verificación de tipos |
| `npm test` | Pruebas con Vitest (las de flujo corren sobre jsdom) |
| `npm run preview` | Sirve `dist/` para comprobar el build |

## Variables de entorno

Solo `VITE_API_URL`, y es **obligatoria**: sin ella la aplicación falla al cargar en vez
de apuntar a un host supuesto. Las pruebas usan su propia URL, fijada en `vite.config.ts`.

Todo lo que Vite inyecta en el bundle es **público**: aquí nunca van secretos JWT,
credenciales de base de datos ni tokens. `.env` está en `.gitignore`; `.env.example` es
la plantilla versionada.

## Estructura

```
src/
  api/              Cliente HTTP y contrato REST
    contracts.ts      ← rutas y tipos REST (identidad + S3), único lugar donde viven
    httpClient.ts       fetch + Bearer + renovación ante 401 + clasificación por estado HTTP
    ApiError.ts         error clasificado; expone `code` y `field` del ProblemDetail
    authApi.ts          RF-01, RF-02 y RF-03
    userApi.ts          usuario autenticado (GET /api/me)
    catalogApi.ts       catálogos fijos: sedes, especialidades activas, tipos y estados de cita
    patientApi.ts       disponibilidad, reserva y mis citas (USER)
    professionalApi.ts  perfil propio y bloques de agenda (PROFESSIONAL)
    adminApi.ts         especialidades, profesionales, bandeja y resumen (ADMIN)
  app/              Marco autenticado: AppShell (barra lateral + cabecera) y menú por rol
  auth/             Sesión y guardas de ruta
    sessionManager.ts     tokens en memoria, renovación única en vuelo y carreras con el logout
    SessionProvider.tsx   conecta la sesión con React y con el cliente HTTP
    CurrentUserProvider   usuario y roles desde GET /api/me
    RequireAuth, RequireRole  sin sesión → /login; ruta de otro rol → "Sin permiso"
    roles.ts              inicio y etiqueta de cada rol
  components/       Card, PageHeader, DataTable, StatusBadge/Badge, Modal, ConfirmDialog,
                    EmptyState, ErrorState, Skeleton, Toast, DateStrip, ChoiceControls
                    (Checkbox, ChoiceCards, SegmentedControl, TextAreaField), AppointmentCard
                    y los campos y avisos de S2
  lib/              fechas (zona America/Bogota), etiquetas de estado y hook useResource
  pages/            auth (S2), patient/, professional/ y admin/
  test/             backend simulado para las pruebas de pantallas (fetch con guion)
  validation/       validación de cliente de los formularios (ayuda, no autoridad)
  styles/           tokens.css (sistema visual y modo oscuro), global.css y app.css
docs/diseno/        Material del flujo Stitch → Google AI Studio
```

## Rutas

| Ruta | Pantalla | Rol | HU |
| --- | --- | --- | --- |
| `/login` | Inicio de sesión | público | HU-002 |
| `/registro` | Registro de usuario | público | HU-001 |
| `/recuperar-password` | Solicitud de recuperación | público | RF-03 |
| `/` | Redirige al inicio del rol de la sesión | autenticado | HU-005 |
| `/paciente` | Inicio: saludo, próximas citas y datos de la cuenta | USER | RF-13 |
| `/paciente/agendar` | Asistente de reserva en 4 pasos | USER | HU-022..024 |
| `/paciente/citas` | Mis citas con filtros de estado y fecha | USER | HU-025 |
| `/paciente/citas/:id` | Detalle con motivo de rechazo e historial | USER | HU-025, HU-030 |
| `/profesional` | Inicio: sedes, especialidades y resumen de la semana | PROFESSIONAL | HU-019 |
| `/profesional/agenda` | Agenda semanal; crear, editar y eliminar bloques | PROFESSIONAL | HU-017..019 |
| `/admin` | Panel con indicadores y accesos directos | ADMIN | HU-029 |
| `/admin/solicitudes` | Bandeja: aprobar y rechazar con motivo | ADMIN | HU-029, HU-030 |
| `/admin/profesionales` | Listado con búsqueda y filtro activo/inactivo | ADMIN | HU-013, HU-016 |
| `/admin/profesionales/nuevo` | Alta de profesional por secciones | ADMIN | HU-013..015 |
| `/admin/profesionales/:id` | Datos, especialidades, sedes y estado | ADMIN | HU-013..016 |
| `/admin/especialidades` | Especialidades con duración 30/60 min | ADMIN | HU-011 |

Una ruta de otro rol muestra **Sin permiso** sin cerrar la sesión; un 403 de la API muestra
**Permiso insuficiente** y mantiene la sesión; un 401 no recuperable vuelve al login
(HU-005 CA-08 y CA-09). Es navegación: la autorización la decide siempre el backend.

## Contrato REST

`src/api/contracts.ts` es el **único** archivo con rutas y tipos de la API. Fuentes en la wiki
del backend: `contrato-rest-identidad.md` (vigente) y `contrato-rest-citas.md` (S3,
provisional hasta verificarlo contra el backend). La UI decide por `status` y por la extensión
`code` del ProblemDetail, y muestra `detail` al usuario. Ningún componente construye URLs: los
filtros pasan por `withQuery`. La recuperación de contraseña (RF-03) aún no existe en el backend.

## Pruebas

Vitest + Testing Library sobre jsdom, con `fetch` simulado (`src/test/fakeBackend.tsx`): cada
prueba de pantalla inicia sesión por el formulario real y responde con un guion por ruta. No hay
pruebas contra el backend real.

## Diseño

El flujo Stitch → Google AI Studio está documentado en `docs/diseno/`:

1. `PANTALLAS_OBLIGATORIAS.md` — las 17 pantallas del PRD §6 con actores, datos,
   acciones y estados.
2. `PROMPTS_STITCH.md` — sistema visual y prompts listos para Stitch.
3. `HANDOFF_AI_STUDIO.md` — exportación, importación en este repo y reconciliación.

Los pasos dentro de Stitch y de AI Studio son interactivos y los ejecuta una persona.
