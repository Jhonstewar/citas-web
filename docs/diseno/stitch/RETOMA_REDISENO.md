# Rediseño del frontend con Stitch — estado

**Abierto:** 2026-09-18 · **Diseño aplicado en código:** 2026-09-23

## Contexto

El usuario no quedó conforme con el front de S3. Se generaron mockups nuevos en Google Stitch
con los prompts de [`../../../../prompts/diseno/PROMPT_STITCH_S4_REDISENO.md`](../../../../prompts/diseno/PROMPT_STITCH_S4_REDISENO.md)
(en el repo raíz). El 2026-09-23 el usuario decidió **aplicar ya el diseño en código** con las
pantallas que había, sin volver a Stitch por las que faltaban.

## Material recibido (en esta carpeta)

| Zip | Contenido |
|---|---|
| `stitch_fcv_citas_ui_design.zip` | Inicio paciente (`code.html` + `screen.png`), logo FCV Citas (`screen.png`), `DESIGN.md` |
| `stitch_fcv_citas_ui_design_login.zip` | Iniciar sesión, Crear cuenta, Recuperar contraseña (paso 1), mismo `DESIGN.md` |

`DESIGN.md` ("Calm Clinical Clarity") es idéntico en ambos zips y es **la fuente de verdad visual**.

### Cuidado: `DESIGN.md` se contradice a sí mismo

El archivo tiene **dos paletas distintas** y no dicen lo mismo:

| | Primario | Acento | Fondo | Texto | Texto 2.º | Borde |
|---|---|---|---|---|---|---|
| Prosa (`## Colors`) | `#0B5C8C` | `#14B8A6` | `#F4F7FA` | `#14212B` | `#5B6B7B` | `#DCE4EB` |
| Frontmatter (`colors:`) | `#00446A` | `#006B5F` | `#F6F9FF` | `#101D27` | `#41474F` | `#C1C7D0` |

**Manda el frontmatter**, porque es el bloque que el `code.html` de cada mockup carga como
configuración de Tailwind: es literalmente lo que se ve en los `screen.png`. La prosa es una
narración que Stitch escribió aparte y que se quedó desfasada.

El `#0B5C8C` de la prosa sigue existiendo en el esquema real, pero como `primary-container`, no
como acción principal, y como primera parada del degradado del panel de marca
(`from-[#0B5C8C] via-primary to-[#073A58]`).

Lo demás: Plus Jakarta Sans + Inter, radios 10/12 px, controles de 44 px, tres niveles de
elevación, pills de estado con icono y borde.

## Aplicado (2026-09-23)

- **Tipografía real, autoalojada.** `src/styles/fonts.css` con `@fontsource-variable/inter` y
  `@fontsource/plus-jakarta-sans` (600 y 700, subconjunto latino). Vía npm, **sin CDN**: la app
  tiene que funcionar sin salida a internet. Hasta ahora las fuentes solo estaban declaradas en
  los tokens y el navegador caía en la pila del sistema, así que el diseño nunca se vio.
- **Tokens** (`src/styles/tokens.css`): bordes propios para cada pill de estado, los tres niveles
  de sombra de `DESIGN.md`, anillos de foco (`--ring-primary`, `--ring-danger`) y degradados de
  marca y de hero. Todo con su equivalente en modo oscuro.
- **Corrección de paleta (2026-09-23, misma sesión).** El primer intento tomó los colores de la
  prosa de `DESIGN.md` y quedaron visiblemente distintos a los mockups: azul más claro, aqua
  turquesa en vez de verde azulado y superficies grises en vez de azuladas. Corregido a los
  tokens del frontmatter, que son los que pinta el `code.html`.
- **Logo real** en `src/components/BrandLogo.tsx` (`BrandMark` + `BrandLockup`): corazón con la
  línea de pulso y la cruz clínica, en SVG y con `currentColor`. En los mockups el logo salía como
  un cuadro vacío. Reemplaza también el favicon morado de Vite.
- **`AuthLayout` a pantalla partida**: panel de marca con degradado, trazo de ECG decorativo,
  lockup con el nombre de la fundación y tres ventajas; formulario a la derecha con ancho máximo
  de 26 rem. En móvil el panel se reduce a cabecera y el formulario queda arriba del pliegue.
- **`AppShell`**: la marca usa el logo nuevo, se añadió la tarjeta de identidad (rol + documento)
  y el elemento de navegación activo es una píldora maciza en primario.
- **Inicio del paciente**: hero claro con degradado suave (ya no un bloque azul macizo), píldora
  "Tienes N citas programadas", marca de agua de cruz y tira de datos reales de la cuenta.
- **Componentes**: tarjeta en reposo al nivel 1 y al nivel 2 solo si es enlace; día seleccionado
  macizo en primario; paso del asistente hecho en aqua con un visto y paso actual en primario.

### Mapa de tokens: Stitch → roles del proyecto

| Rol en `tokens.css` | Token de Stitch | Valor |
|---|---|---|
| `--color-bg` | `surface` / `background` | `#F6F9FF` |
| `--color-surface` | `surface-container-lowest` | `#FFFFFF` |
| `--color-surface-muted` | `surface-container-low` | `#EBF5FF` |
| `--color-text` | `on-surface` | `#101D27` |
| `--color-text-secondary` | `on-surface-variant` | `#41474F` |
| `--color-border` | `outline-variant` | `#C1C7D0` |
| `--color-border-strong` | `outline` | `#717880` |
| `--color-primary` | `primary` | `#00446A` |
| `--color-primary-soft` | `primary-fixed` | `#CDE5FF` |
| `--color-primary-container` | `primary-container` | `#0B5C8C` |
| `--color-accent` | `secondary` | `#006B5F` |
| `--color-accent-strong` | `on-secondary-fixed-variant` | `#005048` |
| `--color-accent-soft` | `secondary-container` | `#6DF5E1` |
| `--color-danger` | `error` | `#BA1A1A` |
| `--color-danger-soft` | `error-container` | `#FFDAD6` |
| `--color-focus` | `surface-tint` | `#1A6393` |
| `--color-on-brand-muted` | `primary-fixed` | `#CDE5FF` |
| `--color-on-brand-accent` | `secondary-fixed` | `#71F8E4` |

Los colores de las pills de estado no salen de los tokens: en el `code.html` son utilidades de
Tailwind (`bg-amber-100 text-amber-900` y equivalentes), que es exactamente lo que ya había.

**Sobre accesibilidad:** el esquema real de Stitch es Material, así que sus pares ya están
calculados para contraste y no hizo falta desviarse de él. `#717880` en bordes de control da
≈4.5:1 (WCAG 1.4.11 pide 3:1), `#41474F` como texto secundario da 9.4:1 y `#00446A` como acción
principal, 10.3:1. La paleta de la prosa sí obligaba a tres desviaciones; con la buena, ninguna.

## Contenido inventado por Stitch: qué se descartó

Se revisó uno por uno y **nada de esto entró en el código**:

- Inicio paciente: "Plan salud Sánitas EPS", "Historia clínica", "Línea prioritaria",
  "Resultados y órdenes", "Chat Asesor", "Reagendar"/"Desistir",
  "Vista previa estado vacío", teléfonos de soporte.
- Login: "SSL 256-bit", "Acreditación JCI", "ID Paciente o EPS", "+2.400 pacientes",
  confirmación por SMS/WhatsApp, testimonio con avatares.
- Crear cuenta: toggle "Modo de simulación UI".
- Recuperar contraseña: tipo y número de documento (solo pide correo).
- Sedes: Stitch escribió "HIC Bucaramanga" e "Instituto del Corazón de Floridablanca"; el
  producto usa **HIC Piedecuesta** e **ICV Floridablanca**, que es lo que sale del catálogo.

## Pendiente

- Revisión visual del usuario en navegador (`npm run dev`) sobre las cuatro pantallas
  rediseñadas y las demás, que heredan el sistema por componentes compartidos.
- Ninguna pantalla nueva: las que faltaban (wizard, mis citas, agenda, panel, solicitudes,
  profesionales, especialidades) ya existían en S3 y toman el estilo de los componentes
  compartidos. Volver a Stitch solo si el usuario lo pide.
- El gráfico "Citas por sede esta semana" del mockup del panel admin **no** se implementó: la API
  no expone esa serie y habría que inventarla.

## Lo que no se tocó

Lógica de negocio, rutas, llamadas a la API y contratos. El rediseño es tokens, marco, marca y
composición. `typecheck`, `lint`, `test` (83/83) y `build` en verde tras el cambio.
