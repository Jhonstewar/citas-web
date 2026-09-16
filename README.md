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
| `npm run preview` | Sirve `dist/` para comprobar el build |

## Variables de entorno

Solo `VITE_API_URL`. Todo lo que Vite inyecta en el bundle es **público**: aquí nunca
van secretos JWT, credenciales de base de datos ni tokens. `.env` está en `.gitignore`;
`.env.example` es la plantilla versionada.

## Estructura

```
src/
  api/          Cliente HTTP y contrato REST
    contracts.ts  ← rutas y tipos REST, único lugar donde viven
    httpClient.ts   fetch + Bearer + clasificación de errores por código de estado
    authApi.ts      operaciones de RF-01, RF-02 y RF-03
    ApiError.ts     error con la causa ya clasificada
  auth/         Contexto de sesión (token en memoria) y guarda de rutas
  components/   Campo, selector, botón de envío, aviso y marco de autenticación
  pages/        Pantallas
  validation/   Validación de cliente de los formularios
  styles/       tokens.css (sistema visual) y global.css
docs/diseno/    Material del flujo Stitch → Google AI Studio
```

## Rutas

| Ruta | Pantalla | PRD |
| --- | --- | --- |
| `/login` | Inicio de sesión | RF-02 |
| `/registro` | Registro de usuario | RF-01 |
| `/recuperar-password` | Solicitud de recuperación | RF-03 |
| `/` | Placeholder protegido; sin sesión redirige a `/login` | §6 |

## Contrato REST

`src/api/contracts.ts` es el **único** archivo con rutas y tipos de la API. Es
provisional: el backend todavía se está construyendo y el contrato real no está
acordado. Ese archivo lleva la lista de puntos a reconciliar con el equipo de
`citas-api`. Ningún componente construye URLs.

## Diseño

El flujo Stitch → Google AI Studio está documentado en `docs/diseno/`:

1. `PANTALLAS_OBLIGATORIAS.md` — las 17 pantallas del PRD §6 con actores, datos,
   acciones y estados.
2. `PROMPTS_STITCH.md` — sistema visual y prompts listos para Stitch.
3. `HANDOFF_AI_STUDIO.md` — exportación, importación en este repo y reconciliación.

Los pasos dentro de Stitch y de AI Studio son interactivos y los ejecuta una persona.
