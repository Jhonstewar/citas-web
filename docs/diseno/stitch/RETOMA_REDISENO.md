# Retoma — rediseño del frontend con Stitch (2026-09-18)

## Contexto

El usuario no quedó conforme con el front actual. Se generaron nuevos mockups en Google Stitch
con los prompts de [`../../../../prompts/diseno/PROMPT_STITCH_S4_REDISENO.md`](../../../../prompts/diseno/PROMPT_STITCH_S4_REDISENO.md)
(en el repo raíz). **Todavía no se ha tocado código**: solo se revisaron los mockups.

## Material recibido (en esta carpeta)

| Zip | Contenido |
|---|---|
| `stitch_fcv_citas_ui_design.zip` | Inicio paciente (`code.html` + `screen.png`), logo FCV Citas (`screen.png`), `DESIGN.md` |
| `stitch_fcv_citas_ui_design_login.zip` | Iniciar sesión, Crear cuenta, Recuperar contraseña (paso 1), mismo `DESIGN.md` |

`DESIGN.md` ("Calm Clinical Clarity") es idéntico en ambos zips y es la fuente del nuevo sistema
de diseño: primario `#0B5C8C`, acento aqua `#14B8A6`, fondo `#F4F7FA`, Plus Jakarta Sans + Inter,
radios 10/12 px, controles de 44 px, sombras por tiers, pills de estado con icono.

## Pantallas que faltan (construir con el mismo estilo, sin volver a Stitch salvo que el usuario lo pida)

- Paciente: Agendar cita (wizard 4 pasos), Mis citas, Detalle de cita
- Profesional: Inicio, Mi agenda
- Admin: Panel, Solicitudes, Profesionales (lista + formulario), Especialidades
- Recuperar contraseña paso 2 (nueva contraseña)
- 403, 404, estados vacíos, skeletons, toasts

## Contenido inventado por Stitch que hay que QUITAR o corregir

- Inicio paciente: tarjetas "Plan salud Sánitas EPS", "Historia clínica", "Línea prioritaria";
  secciones "Resultados y órdenes" y "Chat Asesor"; botones "Reagendar"/"Desistir";
  enlace "Vista previa estado vacío".
- Sedes: usar **HIC Piedecuesta** e **ICV Floridablanca** (Stitch puso "Bucaramanga" e "Instituto del Corazón").
- Login: quitar "SSL 256-bit", "Acreditación JCI", "ID Paciente o EPS" (solo correo), SMS/WhatsApp.
- Crear cuenta: quitar el toggle "Modo de simulación UI".
- Recuperar contraseña: solo pide correo (sin tipo/número de documento); corregir numeración del stepper.
- El logo aparece como cuadro vacío en los paneles azules: usar el logo real (cruz + corazón + pulso).

## Plan acordado (pendiente de confirmación del usuario)

1. Pasar `DESIGN.md` a `src/styles/tokens.css`.
2. Rehacer `AppShell` (sidebar + top bar) y `AuthLayout` (split con panel azul).
3. Reconstruir las 4 pantallas de Stitch quitando lo inventado.
4. Extender el estilo a las pantallas faltantes.
5. **No tocar** lógica, rutas ni llamadas a la API. Correr tests y levantar la app para comparar.

Pregunta abierta al usuario: ¿seguimos así o genera primero en Stitch las pantallas faltantes?
