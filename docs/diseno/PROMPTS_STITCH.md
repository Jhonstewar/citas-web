# Prompts para Google Stitch — S2

Prompts listos para pegar en Stitch. Cubren las cuatro pantallas de S2: registro,
login, recuperación de contraseña y dashboard de USER.

Los prompts están **en inglés** (es lo que mejor interpreta Stitch); el texto de
interfaz que contienen está en español porque es el idioma del producto. La guía de
alrededor está en español porque la ejecutas tú.

## Cómo usar este documento

1. Abre Stitch y crea un proyecto para "FCV Citas".
2. **Pega primero el prompt 0 (sistema visual).** Es el que fija el lenguaje visual
   común; las cuatro pantallas dependen de él.
3. Genera las pantallas en el orden 1 → 4. Login y registro comparten marco, así que
   generar login primero facilita la coherencia.
4. Revisa cada resultado con la lista de verificación del final antes de seguir.
5. Cuando el conjunto te convenza, **aprueba el diseño de forma explícita**. Hasta que
   no haya aprobación explícita no se pasa a Google AI Studio.

**Modo recomendado de Stitch**

| Momento | Modo | Por qué |
| --- | --- | --- |
| Prompt 0 y generación inicial de las 4 pantallas | `Equilibrado / Gemini 3.8` | Hay que sostener un sistema visual coherente entre varias pantallas; es trabajo de arquitectura, no de exploración. |
| Correcciones locales (un espaciado, un color, una etiqueta) | `Velocidad / Gemini 3.5` | Iteración barata sobre algo que ya funciona. |
| Recomposición de una pantalla o cambio que afecta a todas | `Equilibrado / Gemini 3.8` | Vuelve a ser una decisión de sistema. |

Si la interfaz de Stitch cambió los nombres de los modos, elige el equivalente rápido
frente al equivalente de mayor calidad, no el nombre literal.

---

## Sistema visual propuesto

**Tesis de diseño: utilidad clínica serena.** Es una herramienta administrativa para
pedir y gestionar citas, no un producto de marketing. Prioriza legibilidad, calma y
confianza institucional: una sola tarjeta con foco único en autenticación, densidad
media en las pantallas de datos, cero decoración que compita con la acción principal.
Nada de degradados morados, glassmorphism, sombras pesadas ni héroes centrados con
ilustración.

Estos valores están implementados como tokens CSS en
`src/styles/tokens.css`: si el diseño aprobado cambia uno, se cambia allí.

**Color (roles semánticos)**

| Rol | Valor | Uso |
| --- | --- | --- |
| Fondo | `#F2F5F8` | Fondo de página, gris azulado frío |
| Superficie | `#FFFFFF` | Tarjetas, campos |
| Superficie apagada | `#EAEFF4` | Filas alternas, cabeceras de tabla |
| Texto principal | `#16232E` | Cuerpo y títulos |
| Texto secundario | `#55677A` | Ayudas, subtítulos, metadatos |
| Borde | `#D2DBE3` / `#B4C1CD` | Separadores / bordes de control |
| Primario | `#0B5C8C` | Acción principal, enlaces (hover `#094A71`, active `#073A58`) |
| Primario suave | `#E4EFF7` | Fondo de estado seleccionado |
| Éxito | `#1C7A4D` sobre `#E6F3EC` | Confirmaciones, estado APPROVED |
| Peligro | `#B3261E` sobre `#FDECEA` | Errores, estado REJECTED/CANCELLED |
| Foco | `#1D7FC0` | Anillo de foco de 3 px con 2 px de separación |
| Deshabilitado | fondo `#EDF1F5`, texto `#8A99A8` | Controles bloqueados |

Contraste mínimo 4.5:1 en texto; el estado nunca se comunica solo con color: siempre
lleva además texto o icono.

**Tipografía.** Inter, con `Segoe UI` y la pila del sistema como respaldo. Escala:
12 px ayudas · 14 px etiquetas y errores · 16 px cuerpo y campos · 20 px subtítulos ·
24 px título de pantalla · 32 px título de dashboard. Pesos 400/500/600 únicamente.
Interlineado 1.55 en cuerpo y 1.25 en títulos. Texto largo limitado a 48–68 caracteres
por línea.

**Espaciado y densidad.** Escala de 4 px: 4 · 8 · 12 · 16 · 24 · 32 · 48. Altura de
control 44 px (objetivo táctil). Padding de tarjeta 32 px en escritorio, 24 px en
móvil. Separación entre campos 16 px. Densidad media: espaciosa en autenticación, más
compacta en listados y agendas.

**Superficies.** Radio 8 px en controles y 12 px en tarjetas. Borde de 1 px siempre
visible (el contorno hace el trabajo, no la sombra). Una sola sombra suave para la
tarjeta elevada. Sin bordes redondeados grandes ni "píldoras".

**Iconografía.** Iconos de línea de 1.5 px, tamaño 20 px, con etiqueta de texto
acompañante. Sin ilustraciones, sin fotografías de personas, sin imágenes de archivo
médicas.

**Movimiento.** 120–160 ms con `cubic-bezier(0.2, 0, 0.2, 1)`, solo en foco, hover y
aparición de avisos. Un spinner de carga en el botón de envío. Respeta
`prefers-reduced-motion`.

**Tono del texto.** Español neutro, en segunda persona, directo y sin jerga clínica.
Los errores dicen qué pasó y qué hacer: "El correo o la contraseña son incorrectos.
Verifica los datos o recupera tu contraseña", nunca "Error".

---

## Prompt 0 · Sistema visual (pegar primero)

```text
Establish the design system for "FCV Citas", a fictional medical appointment
scheduling web app used in a training lab. Apply this system to every screen
generated in this project. Do not restate it; treat it as the project baseline.

DESIGN THESIS
Calm clinical utility. This is an administrative tool for booking and managing
medical appointments, not a marketing site. Legibility, calm and institutional
trust come before visual expression. One clear focal point per screen. Medium
information density: generous in authentication screens, compact in lists and
schedules.

COLOR ROLES
- Page background: #F2F5F8
- Surface: #FFFFFF
- Muted surface (table headers, alternating rows): #EAEFF4
- Primary text: #16232E
- Secondary text: #55677A
- Divider border: #D2DBE3 / control border: #B4C1CD
- Primary action and links: #0B5C8C, hover #094A71, active #073A58
- Soft primary background for selected state: #E4EFF7
- Success: #1C7A4D on #E6F3EC
- Danger: #B3261E on #FDECEA
- Focus ring: #1D7FC0, 3px, 2px offset
- Disabled: #EDF1F5 background with #8A99A8 text
Never communicate state through color alone; always pair it with text or an icon.

TYPOGRAPHY
Inter, falling back to Segoe UI and the system stack. Sizes: 12px helper text,
14px labels and inline errors, 16px body and form controls, 20px section titles,
24px screen titles, 32px dashboard title. Weights 400, 500 and 600 only. Line
height 1.55 for body and 1.25 for headings. Keep reading measure between 48 and
68 characters.

SPACING AND DENSITY
4px scale: 4, 8, 12, 16, 24, 32, 48. Control height 44px. Card padding 32px on
desktop and 24px on mobile. 16px between form fields.

SURFACES
8px radius on controls, 12px radius on cards. Always a visible 1px border; use a
single soft shadow only on the elevated authentication card. No pill shapes, no
oversized radii, no heavy elevation.

ICONOGRAPHY AND IMAGERY
1.5px line icons at 20px, always next to a text label. No illustrations, no
photography, no stock medical imagery.

MOTION
120-160ms transitions with cubic-bezier(0.2, 0, 0.2, 1), only for focus, hover
and the appearance of alerts. A spinner inside the submit button while a request
is in flight. Respect reduced-motion preferences.

COMPONENT STATES TO DEFINE ONCE AND REUSE
Text input and select: default, hover, focus, filled, error, disabled.
Primary button: default, hover, active, focus, loading, disabled.
Inline alert: error, success, informational.
Form field: label, optional helper text, inline error message below the control.

COPY AND LANGUAGE
All interface copy is in Spanish (Colombia), second person, direct and free of
clinical jargon. Error messages state what happened and what to do next.

AVOID
Purple or blue-to-pink gradients, glassmorphism, dark hero sections, neon
accents, decorative blurred shapes, centered marketing hero layouts, and generic
SaaS dashboard tropes unrelated to appointment scheduling.
```

---

## Prompt 1 · Login

```text
Design the login screen for "FCV Citas" using the established project design
system.

PRODUCT CONTEXT
Fictional medical appointment scheduling web app for a training lab. Patients
(USER), professionals (PROFESSIONAL) and administrators (ADMIN) all sign in
through this same screen with email and password.

PRIMARY JOB
Let a returning person get into their account in as few decisions as possible.

LAYOUT AND HIERARCHY
Single centered card, maximum width 416px, vertically centered on the page
background. Inside the card, top to bottom:
1. Small brand lockup: a 10x20px rounded primary-color mark next to the
   uppercase, letter-spaced wordmark "FCV CITAS" at 14px.
2. Screen title "Inicia sesion" at 24px, weight 600.
3. Subtitle in secondary text: "Accede con el correo con el que creaste tu
   cuenta."
4. A slot above the form where an inline alert appears when sign-in fails.
5. Form: "Correo electronico" (email input) and "Contrasena" (password input).
6. Full-width primary submit button labeled "Entrar".
7. A footer separated by a 1px top border with two links: "Olvide mi contrasena"
   and "No tienes cuenta? Registrate".
Below the card, a 12px centered secondary-text disclaimer: "Entorno de
laboratorio con datos ficticios. No registres informacion real de pacientes ni
de profesionales."
The submit button is the only high-contrast element in the card.

COMPONENTS AND STATES
Show these states explicitly:
- Default empty form.
- Focused email input with the 3px focus ring.
- Inline field error under the email input: "El correo no tiene un formato
  valido, por ejemplo nombre@dominio.com." The input border turns danger red.
- Submitting: the button shows a spinner and the label "Verificando...", and
  both the button and all inputs are disabled.
- Failed sign-in: a danger inline alert at the top of the card reading "Error:
  Correo o contrasena incorrectos." with the supporting line "Verifica los datos.
  Si no recuerdas tu contrasena puedes recuperarla desde el enlace inferior."
- Success: a success inline alert reading "Listo: Sesion iniciada. Entrando..."

INTERACTIONS
Enter submits the form. The field error clears as soon as the person edits that
field. The password field has no visibility toggle in this version.

RESPONSIVE BEHAVIOR
Desktop and tablet: the card stays centered at 416px with generous vertical
space. Mobile at 375px: the card spans the full width minus 16px gutters, loses
its shadow, keeps the border, drops padding to 24px, and the two footer links
stack vertically. Inputs and button keep a 44px height at every size.

ACCESSIBILITY
Every input has a visible persistent label above it, never a placeholder as
label. The error alert is the first focusable region after submission failure.
Visible focus ring on every interactive element. Contrast at least 4.5:1.

OUTPUT INTENT
A high-fidelity screen that becomes the structural template for the other
authentication screens.
```

---

## Prompt 2 · Registro

```text
Design the account registration screen for "FCV Citas", reusing the exact card,
brand lockup, field, button, alert and footer components already defined in the
login screen. Do not introduce a new visual language.

PRIMARY JOB
Let a new patient create a USER account in a single pass, with enough guidance
that they do not have to guess any format.

LAYOUT AND HIERARCHY
Same centered card, widened to 704px because the form has eight fields.
1. Brand lockup, identical to login.
2. Title "Crea tu cuenta" at 24px, weight 600.
3. Subtitle: "Registrate para solicitar y consultar tus citas. Los campos
   marcados con * son obligatorios."
4. Alert slot.
5. Form laid out as a two-column grid on desktop, 16px gap, in this order:
   - "Nombres" (text) and "Apellidos" (text)
   - "Tipo de documento" (select with options "Cedula de ciudadania (CC)",
     "Cedula de extranjeria (CE)", "Tarjeta de identidad (TI)", "Pasaporte (PP)"
     and a "Selecciona..." placeholder) and "Numero de documento" (text)
   - "Correo electronico" with helper text "Lo usaras para iniciar sesion." and
     "Telefono" (tel)
   - "Contrasena" with helper text "Minimo 8 caracteres, con al menos una letra y
     un numero." and "Confirmar contrasena"
   Every label carries a "*" required marker.
6. Full-width primary button "Crear cuenta".
7. Footer with the link "Ya tienes cuenta? Inicia sesion".
Keep the disclaimer line below the card.

COMPONENTS AND STATES
- Default empty form.
- Partially filled form with realistic Colombian-style fictional content: "Laura
  Camila", "Rojas Mendez", "CC", "1098765432", "laura.rojas@ejemplo.com",
  "+57 300 123 4567".
- Inline error under "Confirmar contrasena": "Las dos contrasenas no coinciden."
- Submitting: button shows a spinner with the label "Creando cuenta..." and every
  field is disabled.
- Duplicate-account failure: danger alert at the top reading "Error: El correo ya
  esta registrado." plus a supporting line offering to sign in or recover the
  password, with both words as links.
- Success: success alert reading "Listo: Cuenta creada. Entrando a tu panel..."

RESPONSIVE BEHAVIOR
Desktop: two columns. Tablet at 768px: two columns but the card takes the full
width minus 32px gutters. Mobile at 375px: a single column in the same field
order, 24px card padding, and the submit button pinned as the last element of the
form, full width. Helper text never truncates.

ACCESSIBILITY
Labels are always visible. Errors are announced next to their field, not only in
the top alert. The select shows its placeholder as a non-selectable first option.
Tab order follows the visual order column by column, row by row.

AVOID
Multi-step wizards, progress bars, password strength meters with colored bars,
and any field not listed above.
```

---

## Prompt 3 · Recuperación de contraseña

```text
Design the password recovery flow for "FCV Citas" as two screens sharing the same
card component as login.

SCREEN A - REQUEST LINK
1. Brand lockup.
2. Title "Recupera tu contrasena".
3. Subtitle: "Te enviaremos un enlace temporal de un solo uso al correo de tu
   cuenta."
4. Alert slot.
5. A single field "Correo electronico".
6. Primary button "Enviar instrucciones".
7. Footer link "Volver a iniciar sesion".
States: default; submitting with the spinner and the label "Enviando..."; and the
success state showing a success alert reading "Listo: Si el correo corresponde a
una cuenta, enviamos las instrucciones." with the supporting line "Revisa tu
bandeja de entrada. El enlace caduca y solo puede usarse una vez." In the success
state the button relabels to "Enviar de nuevo" and the form stays usable.
The success message is deliberately neutral so it never reveals whether an email
is registered.

SCREEN B - SET A NEW PASSWORD
Reached from the emailed link, which carries a single-use token.
1. Brand lockup.
2. Title "Define tu nueva contrasena".
3. Subtitle: "Por seguridad, el enlace deja de funcionar despues de usarlo."
4. Fields "Nueva contrasena" with helper text "Minimo 8 caracteres, con al menos
   una letra y un numero." and "Confirmar nueva contrasena".
5. Primary button "Guardar contrasena".
States: default; submitting; success alert "Listo: Tu contrasena fue actualizada."
followed by a primary link-button "Ir a iniciar sesion"; and an expired-token
state that replaces the form entirely with a danger alert reading "Error: El
enlace ya se uso o caduco." plus a primary button "Solicitar un enlace nuevo".

RESPONSIVE BEHAVIOR
Both screens use the 416px centered card and collapse to full width minus 16px
gutters on mobile, identical to the login screen.

ACCESSIBILITY
The expired-token state must be reachable and readable by keyboard alone, and it
must not leave a disabled form on screen that suggests the person can retry.
```

---

## Prompt 4 · Dashboard de USER

```text
Design the authenticated home screen for a patient (USER) in "FCV Citas", using
the established design system. This is the first screen after signing in.

PRIMARY JOB
Answer two questions immediately: "when is my next appointment?" and "how do I
book another one?".

LAYOUT AND HIERARCHY
Application shell, not a centered card.
- Top bar on white surface with a 1px bottom border, 64px tall: brand lockup on
  the left; on the right the person's name in secondary text and a ghost button
  "Cerrar sesion".
- Content column with a maximum width of 960px, centered, 32px top padding.
- Screen title "Hola, Laura" at 32px weight 600, with the subtitle "Este es el
  resumen de tus citas."
- NEXT APPOINTMENT card, the visual focal point of the screen, full width:
  a 14px uppercase label "Proxima cita", then the date and time "Martes 23 de
  septiembre, 10:30 a. m." at 20px weight 600, then a two-column detail grid with
  the pairs Sede / "Hospital Internacional de Colombia (HIC)", Profesional /
  "Dra. Marcela Quintero", Especialidad / "Cardiologia", Duracion / "60 minutos",
  and a success-tone status chip reading "Aprobada". Two actions aligned to the
  bottom right: a ghost button "Reprogramar" and a text-only danger link
  "Cancelar cita".
- A row of three compact status tiles: "Aprobadas 2", "En revision 1",
  "Canceladas 0". Numbers at 24px, labels at 14px secondary. These are counters,
  not clickable cards competing with the next-appointment card.
- A "Tus proximas citas" section listing two more appointments as compact rows:
  date and time, specialty, professional, site, and a status chip. Each row is a
  single click target leading to its detail.
- A persistent primary button "Buscar disponibilidad" in the top right of the
  content column, aligned with the screen title.

COMPONENTS AND STATES
- Populated state as described above.
- Loading state: skeleton placeholders keeping the same geometry as the loaded
  content; never a blank screen or a centered spinner.
- Empty state: no appointments yet. Replace the next-appointment card and the
  list with a single bordered panel containing the title "Aun no tienes citas",
  the line "Busca un horario disponible y solicita tu primera cita.", and the
  primary button "Buscar disponibilidad" as the only action on screen. The
  counter tiles disappear rather than showing zeros everywhere.
- Error state: a danger inline alert at the top of the content column reading
  "Error: No pudimos cargar tus citas." with a ghost "Reintentar" button, while
  the top bar stays usable.

STATUS CHIPS
Aprobada uses success colors, En revision uses the muted surface with primary
text, Rechazada and Cancelada use danger colors. Every chip shows its label as
text; color is never the only signal.

RESPONSIVE BEHAVIOR
Desktop: 960px column, next-appointment details in two columns, three counter
tiles in a row. Tablet: full width minus 32px gutters, details still in two
columns. Mobile at 375px: the "Buscar disponibilidad" button moves below the
screen title and spans the full width; next-appointment details stack into one
column with label above value; counter tiles become a horizontal row of three
narrow tiles; appointment rows stack date, specialty and professional vertically
with the status chip on its own line. The top bar keeps only the brand and an
icon-plus-label sign-out control.

CONTENT REALISM
Use fictional Colombian names and the two real lab sites, "Hospital Internacional
de Colombia (HIC)" and "Fundacion Cardiovascular de Colombia / Instituto
Cardiovascular (ICV)". Do not invent statistics, ratings, testimonials or
promotional claims.

AVOID
Sidebars with navigation items that do not exist yet, charts, calendars in this
screen, notification bells, and any medical record or diagnosis information.
```

---

## Lista de verificación antes de aprobar

Marca cada punto sobre el resultado real de Stitch, no sobre la intención:

- [ ] Las cuatro pantallas usan el mismo marco de tarjeta, la misma marca y los mismos
      componentes de campo, botón y aviso.
- [ ] En cada pantalla se identifica un único foco visual y es la acción principal.
- [ ] Todos los campos tienen etiqueta visible permanente (ningún placeholder haciendo
      de etiqueta).
- [ ] Están dibujados los estados de foco, error, cargando, deshabilitado, éxito y
      vacío que pide cada prompt.
- [ ] Los mensajes de error dicen qué pasó y qué hacer; ninguno dice solo "Error".
- [ ] El estado nunca depende solo del color.
- [ ] Hay vista móvil a 375 px de las cuatro pantallas y la jerarquía se conserva.
- [ ] Los controles mantienen 44 px de alto en móvil.
- [ ] No aparecen ilustraciones, fotos ni degradados decorativos.
- [ ] No hay ningún campo ni pantalla que no esté en el PRD.

Si algo falla, corrige con un prompt incremental: lista primero lo que debe quedar
igual, luego el problema concreto y el cambio exacto. No pidas "mejóralo".

## Al aprobar

Escribe la aprobación de forma inequívoca ("diseño aprobado"). Un "me gusta" o un "va
mejor" no cierra la fase de diseño. En cuanto apruebes:

1. Congela las decisiones visuales y funcionales de las cuatro pantallas.
2. Exporta las capturas aprobadas (escritorio y móvil, y cada estado dibujado).
3. Continúa con `HANDOFF_AI_STUDIO.md`.
