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

`DESIGN.md` ("Calm Clinical Clarity") es idéntico en ambos zips y es **la fuente de verdad visual**:
primario `#0B5C8C`, acento aqua `#14B8A6`, fondo `#F4F7FA`, Plus Jakarta Sans + Inter, radios
10/12 px, controles de 44 px, tres niveles de elevación, pills de estado con icono y borde.

## Aplicado (2026-09-23)

- **Tipografía real, autoalojada.** `src/styles/fonts.css` con `@fontsource-variable/inter` y
  `@fontsource/plus-jakarta-sans` (600 y 700, subconjunto latino). Vía npm, **sin CDN**: la app
  tiene que funcionar sin salida a internet. Hasta ahora las fuentes solo estaban declaradas en
  los tokens y el navegador caía en la pila del sistema, así que el diseño nunca se vio.
- **Tokens** (`src/styles/tokens.css`): bordes propios para cada pill de estado, los tres niveles
  de sombra de `DESIGN.md`, anillos de foco (`--ring-primary`, `--ring-danger`), degradados de
  marca y de hero, `--color-primary-active` a `#06334F`. Todo con su equivalente en modo oscuro.
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

### Desviaciones deliberadas respecto a `DESIGN.md`

Las tres son por accesibilidad; si el usuario prefiere fidelidad literal, se cambian en `tokens.css`.

| `DESIGN.md` | Implementado | Motivo |
|---|---|---|
| Borde de campo `#DCE4EB` | `--color-border-strong` (`#B7C4D0`) | `#DCE4EB` sobre blanco da ~1.3:1 y WCAG 1.4.11 pide 3:1 para bordes de control |
| Foco de botón con aqua `#14B8A6` | `--color-focus` (`#1D7FC0`) | El aqua sobre blanco da 2.3:1; el azul de foco cumple 3:1 |
| Franja elegida con fondo `#14B8A6` | `--color-accent-strong` (`#0F766E`) | Texto blanco sobre `#14B8A6` da 2.3:1; sobre `#0F766E` da 4.9:1 |

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
