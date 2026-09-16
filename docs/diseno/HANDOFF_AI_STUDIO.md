# Handoff a Google AI Studio

Procedimiento para convertir el diseño aprobado en Stitch en código frontend y traerlo
a este repositorio. Los pasos interactivos (Stitch, AI Studio, exportar el ZIP) los
ejecuta una persona; el agente no tiene acceso a esas interfaces.

**Requisito previo innegociable:** el diseño debe estar **aprobado de forma explícita**
en Stitch. "Me gusta" o "va mejor" no cuenta. Sin aprobación, no se empieza.

---

## Paso 0 · Congelar la fuente de verdad

Antes de escribir nada en AI Studio, reúne en una carpeta local los artefactos del
diseño aprobado. Esto es lo que será autoritativo durante toda la implementación:

| Artefacto | Qué incluir |
| --- | --- |
| Capturas de escritorio | Login, registro, recuperación A y B, dashboard USER, a ancho ≥ 1280 px |
| Capturas móviles | Las mismas pantallas a 375 px |
| Capturas de estado | Foco, error de campo, cargando, éxito, vacío y deshabilitado, tal como los dibujó Stitch |
| Sistema visual | La sección "Sistema visual propuesto" de `PROMPTS_STITCH.md`, que ya es el DESIGN.md del proyecto |
| Texto de interfaz | Las etiquetas y mensajes en español exactamente como quedaron aprobados |
| Restricciones técnicas | Las tres de la sección siguiente |

Guarda las capturas en `docs/diseno/aprobado/` dentro de este repositorio para que el
diseño aprobado quede versionado junto al código que debe parecerse a él.

## Restricciones que deben sobrevivir al handoff

AI Studio tiende a añadir alcance por su cuenta. Estas tres restricciones van escritas
dentro del prompt y se verifican al recibir el código:

1. **React + TypeScript.** Es lo que ya está inicializado en este repositorio.
2. **Sin backend, sin Express, sin BFF, sin Firebase, sin base de datos, sin
   despliegue.** El frontend llamará directamente a la API REST de Spring Boot; esa
   integración se cablea aquí, no en AI Studio.
3. **Sin secretos ni URLs de API en el código generado.** La URL del backend llega por
   variable de entorno.

## Paso 1 · Qué se exporta desde Stitch

Desde el proyecto aprobado en Stitch, saca:

- las capturas de la tabla del paso 0;
- el código que Stitch genere para cada pantalla, si lo ofrece, **como referencia de
  medidas y tokens, no como el código que se va a usar**.

Stitch es la fuente de verdad visual; AI Studio es quien construye la aplicación.

## Paso 2 · Qué se le pide a Google AI Studio

Abre AI Studio en modo Build, adjunta las capturas aprobadas y pega este prompt. Está
en inglés a propósito. Rellena únicamente las capturas adjuntas: el resto ya está
concretado.

```text
Build a production-oriented React + TypeScript frontend that faithfully implements
the approved Google Stitch design in the attached screenshots.

IMPLEMENTATION GOAL
Reproduce the approved UI and its interaction states with high visual fidelity,
keeping the code modular and easy to continue developing after export. Do not
reinterpret the visual direction and do not introduce a new design system.

SOURCE OF TRUTH
The attached Stitch screenshots, the design tokens listed below and the Spanish
interface copy visible in the screenshots are authoritative. Where a screenshot
and your own judgement disagree, the screenshot wins.

PRODUCT
"FCV Citas", a fictional medical appointment scheduling web app for a training
lab. Primary users are patients (USER) who register, sign in, recover their
password and review their appointments.

REQUIRED ROUTES
- /login - sign in with email and password
- /registro - create a patient account
- /recuperar-password - request a single-use recovery link
- /recuperar-password/:token - set a new password
- / - authenticated patient home, redirecting to /login when there is no session

DESIGN TOKENS
Centralize these as CSS custom properties in a single stylesheet and use them
everywhere. Do not hardcode color or spacing values in components.
- Background #F2F5F8, surface #FFFFFF, muted surface #EAEFF4
- Primary text #16232E, secondary text #55677A
- Borders #D2DBE3 and #B4C1CD
- Primary #0B5C8C, hover #094A71, active #073A58, soft #E4EFF7
- Success #1C7A4D on #E6F3EC, danger #B3261E on #FDECEA
- Focus ring #1D7FC0, 3px, 2px offset
- Disabled #EDF1F5 background with #8A99A8 text
- Font Inter with Segoe UI and the system stack as fallback
- Type scale 12, 14, 16, 20, 24, 32 px; weights 400, 500, 600; line height 1.55
  body and 1.25 headings
- Spacing scale 4, 8, 12, 16, 24, 32, 48 px; control height 44px
- Radius 8px on controls and 12px on cards; 1px borders; one soft card shadow
- Transitions 120-160ms with cubic-bezier(0.2, 0, 0.2, 1)

COMPONENT ARCHITECTURE
Create reusable components for the authentication card layout, the labeled text
input, the labeled select, the primary submit button and the inline alert. Every
screen must be composed from these, not from ad-hoc markup.

INTERACTIONS AND STATES
Implement, for every form: default, focused, filled, client-side validation
error per field, submitting, server error and success. The submit button must be
disabled and show a spinner while a request is in flight. Implement the loading,
empty and error states of the patient home screen exactly as drawn.

RESPONSIVE BEHAVIOR
Implement the desktop, tablet and mobile layouts shown in the screenshots.
Preserve hierarchy when collapsing: the registration form goes from two columns
to one, the home screen action button moves below the title and spans full width,
and controls keep a 44px height on mobile.

ACCESSIBILITY
Semantic HTML, a visible persistent label for every field, aria-invalid and
aria-describedby wiring errors to their inputs, visible focus rings, keyboard
operability, contrast of at least 4.5:1, and state communicated by text as well
as color.

DATA
Do not implement any backend integration. Use a single isolated module of mock
async functions for sign-in, registration and password recovery, so it can be
replaced later by a real REST client. Keep all data access behind that module.

DO NOT ADD
Express, a BFF, Firebase, a database, real authentication, deployment
configuration, analytics, a UI component library, or any route, field or screen
not listed above.

ACCEPTANCE CRITERIA
1. The running app visually matches the attached screenshots at desktop and at
   375px width.
2. All five routes render and navigate correctly.
3. Every listed form state is reachable in the preview.
4. Design tokens live in one place and are used consistently.
5. No backend, no secrets and no hardcoded API URLs.
6. The project builds and can be exported for continued development elsewhere.

Before finishing, run the live preview, compare it against the attached
screenshots, and fix the fidelity and runtime problems you find.
```

## Paso 3 · Cómo se importa en este repositorio

Este repositorio **ya tiene** una aplicación React + TypeScript + Vite funcionando, con
enrutado, cliente HTTP, contexto de sesión y las pantallas de login, registro y
recuperación. Lo que llega de AI Studio es **la capa visual**, no un reemplazo del
proyecto.

**Regla de importación: entra el diseño, no la arquitectura.**

1. Descarga el ZIP desde AI Studio y descomprímelo **fuera** de este repositorio.
2. Compara antes de copiar nada. Lo que se trae:
   - hojas de estilo y tokens → se reconcilian contra `src/styles/tokens.css` y
     `src/styles/global.css`;
   - componentes de presentación (tarjeta, campo, botón, aviso) → se reconcilian contra
     `src/components/`;
   - estructura de las pantallas (orden, textos, espaciado) → se reconcilian contra
     `src/pages/`.
3. Lo que **no** se trae bajo ninguna circunstancia:
   - el módulo de datos simulado: aquí ya existe `src/api/` con el cliente real;
   - su propio enrutador, si difiere de las rutas de `src/App.tsx`;
   - dependencias nuevas que no aporten nada al diseño (librerías de componentes, de
     iconos pesadas, de estado);
   - cualquier `.env`, clave o URL de API embebida.
4. Copia archivo por archivo, no carpeta por carpeta, y ejecuta después de cada bloque:

   ```bash
   npm run build
   npx tsc --noEmit
   ```

5. Si AI Studio eligió una librería de estilos (por ejemplo Tailwind) y el equipo la
   acepta, se instala explícitamente y se documenta; si no, se traduce el resultado a
   los tokens CSS ya existentes. No se mezclan los dos sistemas.

## Paso 4 · Cómo se reconcilia contra el diseño aprobado

Cuando el código ya está en el repositorio, se compara el resultado real contra las
capturas aprobadas **en este orden**, porque un error estructural invalida cualquier
ajuste cosmético que se haga antes:

1. rutas y pantallas presentes, y contenido que falte;
2. geometría de la maquetación y jerarquía;
3. comportamiento responsive a 1280 px, 768 px y 375 px;
4. tipografía: tamaños, pesos, interlineado, medida de línea;
5. dimensiones y espaciado de los componentes;
6. color por rol, bordes, radios, elevación;
7. tratamiento de iconos;
8. estados de interacción: foco, error, cargando, deshabilitado, éxito, vacío;
9. movimiento y microinteracciones.

Para cada diferencia, decide la severidad antes de tocar código:

- **Local** (un componente): arréglalo en ese componente.
- **Sistémica** (se repite en varias pantallas): arregla el token o el componente
  compartido, no cada aparición. Si el mismo espaciado está mal en tres pantallas, el
  problema está en `tokens.css`.
- **Replanteo** (la arquitectura de la pantalla no sirve para la tarea): vuelve a la
  fase de diseño en Stitch. No se rediseña durante la reconciliación.

Si prefieres que AI Studio corrija en vez de editar aquí, el prompt correctivo debe
listar primero **lo que debe quedar intacto**, luego cada desajuste con su componente y
su comportamiento esperado, y terminar pidiendo que verifique la vista previa. Nunca
"mejora el diseño".

## Paso 5 · Cierre

El handoff está cerrado cuando:

- [ ] las pantallas implementadas coinciden con las capturas aprobadas en escritorio y
      en móvil;
- [ ] todos los estados dibujados son alcanzables en la aplicación;
- [ ] `npm run build` y `npx tsc --noEmit` pasan;
- [ ] no entró ningún backend, secreto ni URL de API embebida;
- [ ] las capturas aprobadas están versionadas en `docs/diseno/aprobado/`;
- [ ] el cliente REST de `src/api/` sigue siendo el único camino a la API, y
      `src/api/contracts.ts` sigue siendo el único lugar con rutas y tipos.

Lo que queda fuera de este handoff: el contrato REST real contra `citas-api` y las 13
pantallas restantes del PRD §6, que se diseñan en Stitch en sesiones posteriores
siguiendo el mismo procedimiento.
