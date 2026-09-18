# AGENTS.md — Agente principal de `citas-web`

Generado en S2 (paso 2) con `../prompts/agents/PROMPT_AGENT_CITAS_WEB.md`, a partir del
código real del repositorio. La gobernanza global está en `../AGENTS.md`; este archivo la
concreta para el frontend y **no** la contradice.

> **Pendiente:** el diseño de Stitch → Google AI Studio (S2 paso 4) aún no se ha importado.
> Cuando se importe, este archivo se **revisa** con el mismo prompt: si AI Studio exporta otro
> stack o estructura, gana lo importado y aprobado, no lo que dice aquí.

## 1. Stack detectado (no cambiar por preferencia)

| Aspecto | Valor real (`package.json`) |
|---|---|
| Framework | **React 19** + TypeScript ~6.0 |
| Build / dev | Vite 8 (`@vitejs/plugin-react`) |
| Router | `react-router` 8 |
| Pruebas | Vitest 5 + Testing Library + jsdom |
| Lint | oxlint (`.oxlintrc.json`) |
| Runtime | Node 24 LTS |

No hay Angular en este repo (el `.gitignore` conserva `.angular/` solo por herencia).

## 2. Estructura

```
src/
├── api/          Único punto de contacto con citas-api
│   ├── contracts.ts   rutas y tipos REST — el ÚNICO lugar donde viven
│   ├── httpClient.ts  fetch + Bearer + clasificación de errores por estado HTTP
│   ├── authApi.ts / userApi.ts
│   └── ApiError.ts
├── auth/         Sesión: sessionManager (tokens en memoria, una sola renovación en vuelo,
│                 épocas contra carreras con el logout), SessionProvider, RequireAuth
├── components/   Campos, selector, botón de envío, avisos, AuthLayout
├── pages/        Login, Registro, RecuperarPassword, DashboardPlaceholder, NotFound
├── validation/   Validación de cliente de formularios (ayuda al usuario, no autoridad)
└── styles/       tokens.css (sistema visual) y global.css
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
- Los tokens viven en memoria (no `localStorage`). Cambiarlo es una decisión abierta de la wiki,
  no una iniciativa del agente.
- Alta fidelidad al diseño aprobado: al reconciliar lo importado de AI Studio se preservan los
  componentes, tokens y estilos que ya son correctos; no se rediseñan pantallas aprobadas.
- Cada pantalla contempla sus estados: `loading`, `empty`, `error`, `success` y `disabled`, con
  mensajes en español y accesibles (labels, foco, `aria-*`).

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
