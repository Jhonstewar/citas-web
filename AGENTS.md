# AGENTS.md — Agente principal de `citas-web`

Generado en S2 (paso 2) con `../prompts/agents/PROMPT_AGENT_CITAS_WEB.md`, a partir del
código real del repositorio. La gobernanza global está en `../AGENTS.md`; este archivo la
concreta para el frontend y **no** la contradice.

> **Diseño:** el sistema visual aprobado en Stitch se aplicó el 2026-09-23 (commit `08cbe02`;
> ver `docs/diseno/stitch/RETOMA_REDISENO.md` y la wiki `dec-005-sistema-visual-stitch`). En S4
> las pantallas nuevas se construyen **sin mockups nuevos**, con los tokens de
> `src/styles/tokens.css` y los componentes de `src/components` (decisión D30 de
> `dec-006-decisiones-s4-ciclo-de-vida`). No se rediseña lo ya aprobado.

## 1. Stack detectado (no cambiar por preferencia)

| Aspecto | Valor real (`package.json`) |
|---|---|
| Framework | **React 19** + TypeScript ~6.0 |
| Build / dev | Vite 8 (`@vitejs/plugin-react`) |
| Router | `react-router` 8 |
| Pruebas | Vitest 5 + Testing Library + jsdom |
| Lint | oxlint (`.oxlintrc.json`) |
| Iconos | `lucide-react` (única dependencia de UI añadida en S3) |
| Estilos | CSS propio con tokens; sin frameworks CSS |
| Runtime | Node 24 LTS |

No hay Angular en este repo (el `.gitignore` conserva `.angular/` solo por herencia).

## 2. Estructura

```
src/
├── api/          Único punto de contacto con citas-api
│   ├── contracts.ts   rutas y tipos REST (identidad + S3) — el ÚNICO lugar donde viven
│   ├── httpClient.ts  fetch + Bearer + renovación ante 401 + clasificación por estado HTTP
│   ├── ApiError.ts    kind, status, fieldErrors y extensiones `code`/`field` del ProblemDetail
│   └── authApi / userApi / catalogApi / patientApi / professionalApi / adminApi
├── app/          AppShell (barra lateral + cabecera) y navegación por rol
├── auth/         Sesión: sessionManager (access token en memoria, refresh en cookie HttpOnly
│                 desde D36, una sola renovación en vuelo, épocas contra carreras con el logout,
│                 arranque checking/unavailable), refreshLock (Web Locks entre pestañas),
│                 SessionProvider, RequireAuth, CurrentUserProvider (GET /api/me), RequireRole
│                 y roles.ts
├── components/   Sistema de componentes (Card, Modal, ConfirmDialog, DataTable, StatusBadge,
│                 EmptyState, ErrorState, Skeleton, Toast, DateStrip, ChoiceControls…) y los de S2
├── lib/          dates.ts (zona America/Bogota), status.ts, useResource.ts
├── pages/        auth (S2), ForbiddenPage, NotFound, patient/, professional/, admin/
├── test/         fakeBackend.tsx: fetch simulado con guion para las pruebas de pantallas
├── validation/   Validación de cliente de formularios (ayuda al usuario, no autoridad)
└── styles/       tokens.css (sistema visual, modo oscuro), global.css y app.css
docs/diseno/      PANTALLAS_OBLIGATORIAS, PROMPTS_STITCH, HANDOFF_AI_STUDIO
```

## 3. Reglas

- **Solo frontend.** Prohibido Express, BFF o proxy de aplicación: se llama a `citas-api`
  directamente por REST.
- El backend es la autoridad. La validación de cliente mejora la experiencia, pero ninguna regla
  de negocio (disponibilidad, doble reserva, transiciones de estado, permisos) vive solo aquí.
- Ningún componente construye URLs ni declara tipos de la API: todo pasa por `src/api/contracts.ts`.
  Si el contrato no alcanza, **no** edites `citas-api`: repórtalo al orquestador como cambio cross-repo.
- `VITE_API_URL` es obligatoria y viene del entorno (`.env`, no versionado). Todo lo que Vite
  inyecta es público: nunca secretos, credenciales ni tokens en código o en `.env`.
- Tokens (D36): solo el **access token** vive en memoria (nunca `localStorage` ni
  `sessionStorage`). El **refresh token** viaja en la cookie `HttpOnly` `fcv_refresh`
  (`SameSite=Strict; Path=/api/auth`) que emite y rota el servidor: JavaScript no lo ve, no lo
  guarda y no lo envía en ningún cuerpo. `credentials: 'include'` se usa **solo** en
  `/api/auth/**` (login, refresh, logout); el resto de la API va sin credenciales y con
  `Authorization: Bearer`. Al arrancar (F5) se restaura la sesión con un refresh: 401 → login;
  red caída o 5xx → estado `unavailable` con "Reintentar" en las rutas protegidas. Cambiar este
  modelo es una decisión de la wiki, no una iniciativa del agente.
- Alta fidelidad al diseño aprobado: al reconciliar lo importado de AI Studio se preservan los
  componentes, tokens y estilos que ya son correctos; no se rediseñan pantallas aprobadas.
- Cada pantalla contempla sus estados: `loading`, `empty`, `error`, `success` y `disabled`, con
  mensajes en español y accesibles (labels, foco, `aria-*`).
- Rutas por rol: `/paciente` (USER), `/profesional` (PROFESSIONAL), `/admin` (ADMIN). Una ruta
  de otro rol muestra "Sin permiso" sin cerrar sesión; un 403 de la API muestra "Permiso
  insuficiente" (`ErrorState`); solo el 401 no recuperable devuelve al login.
- Los errores se deciden por `status` y `code` (`ERROR_CODES` en `contracts.ts`) y se muestra
  `detail`; nunca se parsea el texto del servidor.
- Los estados de cita se muestran con color + icono + texto (`StatusBadge`), nunca solo color.
- Pruebas de pantalla: `src/test/fakeBackend.tsx` (login por el formulario real y `fetch` con
  guion por ruta). Si una prueba depende de "hoy", fija la fecha con
  `vi.useFakeTimers({ toFake: ['Date'] })`.

## 4. Comandos

```powershell
npm install
Copy-Item .env.example .env      # ajusta VITE_API_URL si el backend no está en localhost:8080
npm run dev                      # http://localhost:5173
npm test                         # Vitest
npm run typecheck                # tsc -b
npm run lint                     # oxlint
npm run build                    # typecheck + build de producción
```

Las pruebas no dependen del `.env`: `vite.config.ts` fija `VITE_API_URL=http://api.test`.

## 5. Modo de trabajo

1. Lee la HU `Aprobada`, sus CA y la DoD en `../citas-api/docs/wiki/scrum/`.
2. Identifica pantallas, componentes y servicios afectados, y el contrato REST que usan.
3. Mapea los estados `loading/empty/error/success/disabled` de cada pantalla.
4. Implementa sin rediseñar lo aprobado.
5. Ejecuta `npm test`, `npm run typecheck`, `npm run lint` y `npm run build`.
6. Verifica el comportamiento contra los CA. La verificación formal la hace `frontend-verifier`.
7. Resume la evidencia y deja explícito lo que no se verificó.

## 6. Límites

- No edites `citas-api`.
- No mantengas una LLM Wiki propia: la única es `../citas-api/docs/wiki/llm-wiki/`, a cargo del orquestador.
- Git: trabajo en `develop`, Conventional Commits en español con prefijo de sesión. Nunca stagear
  `.env`, `node_modules/` ni `dist/`. Sin push sin confirmación del usuario.
