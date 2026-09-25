# Pantallas obligatorias — PRD §6

Las 17 pantallas que el producto final debe cubrir. Todo lo que aparece aquí está
derivado del PRD (§2 actores, §4 RF-01..RF-20, §5 reglas de negocio) y del modelo de
datos de referencia. **No se inventaron pantallas ni campos.**

## Cómo leer este documento

- **Actor**: quién ve la pantalla (USER, PROFESSIONAL, ADMIN, visitante sin sesión).
- **Datos**: qué información se muestra, con su RF de origen.
- **Acciones**: qué puede hacer el usuario.
- **Estados**: vacío / cargando / error / sin permisos, más los propios de la pantalla.

Dos reglas transversales, válidas para las 17:

1. **El frontend no decide reglas de negocio.** Las RN-01..RN-12 las aplica el backend.
   La UI pide, muestra el resultado y traduce el error; nunca calcula si una cita es
   válida ni si un rol autoriza algo.
2. **Mapa de errores compartido** (implementado en `src/api/httpClient.ts`):
   400 validación (mensaje del servidor, por campo cuando lo dé) · 401 sesión expirada
   (volver a `/login`) · 403 sin permisos (pantalla de acceso denegado, sin ofrecer la
   acción) · 404 recurso inexistente · 409 conflicto (slot ya tomado, email/documento
   duplicado) · 5xx mensaje genérico + reintento · sin red, aviso de API no disponible.

---

## 1. Registro · `/registro`

- **Actor**: visitante sin sesión. Crea siempre una cuenta `USER` (RF-01; los
  PROFESSIONAL los crea ADMIN, RF-07).
- **Datos**: formulario con nombres, apellidos, tipo de documento, número de documento,
  email, teléfono, contraseña y confirmación de contraseña. Aviso de que es un entorno
  de laboratorio con datos ficticios (PRD §8).
- **Acciones**: crear cuenta; ir a login; ver requisitos de contraseña.
- **Estados**:
  - *cargando*: submit deshabilitado y con spinner mientras el POST está en vuelo.
  - *error de validación de cliente*: mensaje por campo antes de llamar a la API.
  - *error 400*: se muestran los mensajes del servidor sobre los campos señalados.
  - *error 409*: email o documento ya registrados (unicidad de RF-01) con enlaces a
    login y a recuperación.
  - *5xx / sin red*: aviso general, el formulario conserva lo escrito.
  - *éxito*: confirmación y entrada a la sesión.
  - *sin permisos*: no aplica (pantalla pública).
  - *vacío*: no aplica (es un formulario).

## 2. Login · `/login`

- **Actor**: visitante sin sesión (los tres roles entran por aquí, RF-02).
- **Datos**: email y contraseña. Enlaces a registro y a recuperación.
- **Acciones**: iniciar sesión; ir a recuperación; ir a registro.
- **Estados**: cargando con botón bloqueado · credenciales incorrectas (401 en login
  **no** es "sesión expirada") · cuenta desactivada (403) · 5xx/sin red · éxito con
  redirección a la ruta que el usuario intentaba abrir.

## 3. Recuperación y cambio de contraseña · `/recuperar-password`, `/restablecer-password`

- **Actor**: visitante sin sesión (RF-03).
- **Datos**: paso 1 (`/recuperar-password`), email. Paso 2 (`/restablecer-password?token=…`),
  nueva contraseña y confirmación; al abrirse, la pantalla guarda el token y lo quita de la
  barra de direcciones para que no quede en el historial. En desarrollo el backend puede exponer el token de forma controlada:
  la UI lo muestra marcado como dato de laboratorio.
- **Acciones**: solicitar enlace; reenviar; definir nueva contraseña.
- **Estados**: cargando · éxito con mensaje neutro ("si el correo corresponde a una
  cuenta…") para no revelar qué correos existen · token inválido, caducado o ya usado
  (es de un solo uso) con opción de pedir otro · 400 de política de contraseña · 5xx.

## 4. Home / dashboard USER · `/paciente`

- **Actor**: USER. `/` redirige al inicio del rol (`/paciente`, `/profesional` o `/admin`).
- **Datos**: próxima cita aprobada (sede, profesional, especialidad, fecha/hora,
  duración, estado — RF-13) y contadores de citas por estado; accesos a buscar
  disponibilidad y a mis citas.
- **Acciones**: buscar disponibilidad (RF-10); abrir mis citas (RF-13); abrir perfil y
  afiliación (RF-04); cerrar sesión.
- **Estados**: cargando (esqueletos, no pantalla en blanco) · **vacío**: sin citas aún,
  con la acción primaria "Buscar disponibilidad" como único foco · error de carga con
  reintento · 401 vuelve a login · 403 si el rol no corresponde.

## 5. Buscar disponibilidad · `/paciente/agendar` (pasos 1 a 3)

- **Actor**: USER (RF-10).
- **Datos**: filtros de sede (HIC / ICV, catálogo fijo de PRD §3), tipo de cita
  general o especializada, especialidad, profesional y fecha. Resultados: horarios que
  cubren la duración completa exigida por la especialidad (30 o 60 min, RF-09), con
  profesional, sede y hora de inicio.
- **Acciones**: aplicar y limpiar filtros; cambiar de día; seleccionar un horario y
  continuar a solicitar cita.
- **Estados**: **vacío inicial** (aún no se ha buscado) distinto de **sin resultados**
  (no hay horarios que cubran la duración ese día — sugerir cambiar fecha o sede) ·
  cargando sobre la lista, con los filtros aún operables · error 400 de filtros
  inválidos · 5xx · 401.

## 6. Solicitar cita · `/paciente/agendar` (paso 4, confirmación)

- **Actor**: USER (RF-11 general, RF-12 especializada).
- **Datos**: resumen de lo escogido — sede, especialidad, profesional, fecha/hora,
  duración — y el aviso de qué va a pasar al confirmar: la cita general queda
  `APPROVED` automáticamente (RN-02); la especializada nace en `REQUESTED` y espera a
  ADMIN (RN-03).
- **Acciones**: confirmar; volver a cambiar el horario.
- **Estados**: cargando con botón bloqueado (una confirmación duplicada intentaría
  reservar dos veces) · **409 el horario dejó de estar disponible** (RN-01), con
  retorno a la búsqueda · 400 de datos inválidos · 403 si la especialidad no está
  activa o no corresponde al profesional (RN-08) · éxito diferenciado según el estado
  con el que nació la cita.

## 7. Mis citas y detalle · `/paciente/citas`, `/paciente/citas/:id`

- **Actor**: USER (RF-13).
- **Datos**: listado con sede, profesional, especialidad, fecha/hora, duración, estado
  y motivo de rechazo cuando exista. Filtros por estado y por fecha. El detalle añade
  el historial de cambios de estado (RF-19).
- **Acciones**: filtrar; abrir detalle; cancelar (RF-14); solicitar reprogramación
  cuando la cita está aprobada y es futura (RF-15).
- **Estados**: **vacío** sin citas · **vacío filtrado** (hay citas, pero ningún filtro
  coincide: ofrecer limpiar filtros) · cargando · error de carga · 403/404 al abrir una
  cita que no pertenece al usuario · acciones deshabilitadas con motivo visible cuando
  la cita es pasada o está en estado terminal.

## 8. Cancelar cita (diálogo sobre el detalle y sobre la próxima cita de `/paciente`)

- **Actor**: USER (RF-14).
- **Datos**: datos de la cita a cancelar y advertencia de que una cita cancelada no se
  reactiva.
- **Acciones**: confirmar cancelación; desistir.
- **Estados**: cargando con confirmación bloqueada · 409 si la cita ya cambió de estado
  en el servidor · 403 si no es del usuario · éxito con la lista actualizada.

## 9. Solicitar reprogramación · `/paciente/citas/:id/reprogramar`

- **Actor**: USER (RF-15).
- **Datos**: cita original (que se conserva hasta que ADMIN decida, RN-10), profesional
  y especialidad fijos y no editables (cambiar de profesional es una cita nueva), y el
  selector de nueva fecha/hora disponible.
- **Acciones**: elegir nueva franja; enviar solicitud; cancelar el flujo.
- **Estados**: **no elegible** (la cita no está aprobada o no es futura): explicar por
  qué en vez de ocultar la opción sin motivo · sin franjas disponibles · cargando ·
  409 si la nueva franja se ocupó · éxito en estado `PENDING`, con la cita original
  todavía vigente.

## 10. Dashboard PROFESSIONAL · `/profesional`

- **Actor**: PROFESSIONAL (RF-16).
- **Datos**: citas `APPROVED` de hoy por sede, próximas atenciones y citas pendientes
  de cierre (RF-17). Solo datos de sus propias citas.
- **Acciones**: abrir agenda; abrir gestión de bloques; cerrar atención.
- **Estados**: vacío (día sin citas) · cargando · error · 403 si el usuario no es
  PROFESSIONAL.

## 11. Gestionar bloques / calendario · `/profesional/agenda` (pestaña Bloques)

- **Actor**: PROFESSIONAL (RF-08).
- **Datos**: bloques por día con hora de inicio, hora de fin y sede; solo sedes
  asignadas al profesional (RN-07). Indicación de qué bloques tienen citas
  comprometidas.
- **Acciones**: crear varios bloques por día; editar o eliminar bloques futuros sin
  citas; cambiar de día o semana.
- **Estados**: vacío (día sin bloques) · cargando · **400 de reglas del servidor**:
  bloque en el pasado (RN-06) o solapado con otro del mismo profesional; el mensaje del
  backend es el que se muestra · 403 sede no asignada · 409 al editar un bloque que ya
  tiene citas · éxito.

## 12. Agenda del profesional · `/profesional/agenda?vista=citas` (pestaña Citas)

- **Actor**: PROFESSIONAL (RF-16, RF-17).
- **Datos**: vista por día y por semana, filtrada por sede, con las citas `APPROVED`:
  hora, duración, especialidad y el paciente de esa cita. No se exponen datos de
  usuarios ajenos a sus citas.
- **Acciones**: cambiar día/semana/sede; abrir una cita; marcar `COMPLETED` o `NO_SHOW`
  en las citas pasadas aplicables (RF-17), quedando registrado en el historial.
- **Estados**: vacío por día o sede · cargando · error · cierre no aplicable (cita
  futura o ya cerrada): control deshabilitado con motivo · 409 si otro actor ya cambió
  el estado.

## 13. Dashboard ADMIN · `/admin`

- **Actor**: ADMIN (RF-18).
- **Datos**: número de citas especializadas en `REQUESTED` y de reprogramaciones en
  `PENDING`; accesos a la bandeja y a los CRUD.
- **Acciones**: abrir bandeja de citas; abrir bandeja de reprogramaciones; abrir CRUD
  de profesionales, especialidades y EPS/planes.
- **Estados**: vacío (nada pendiente, que es un resultado bueno y debe leerse así) ·
  cargando · error · 403 si el rol no es ADMIN.

## 14. Aprobar / rechazar citas · `/admin/solicitudes?tipo=APPOINTMENT_REQUEST`

- **Actor**: ADMIN (RF-12, RF-18).
- **Datos**: bandeja de citas especializadas en `REQUESTED` con solicitante, sede,
  profesional, especialidad, fecha/hora y duración. Filtros por sede, profesional,
  especialidad y fecha.
- **Acciones**: aprobar (pasa a `APPROVED`); rechazar con **motivo obligatorio**
  (RN-04; al rechazar se liberan los slots, RN-09).
- **Estados**: **vacío** sin solicitudes · vacío filtrado · cargando por fila, con el
  resto de la bandeja utilizable · 400 si falta el motivo de rechazo (el servidor
  también lo valida) · 409 si otro ADMIN ya resolvió la solicitud, refrescando la fila ·
  403 · 5xx.

## 15. Aprobar / rechazar reprogramaciones · `/admin/solicitudes?tipo=RESCHEDULE_REQUEST`

- **Actor**: ADMIN (RF-15, RF-18).
- **Datos**: solicitudes en `PENDING` mostrando en paralelo la franja original y la
  nueva franja retenida, con solicitante, profesional, especialidad y sede. Mismos
  filtros que la bandeja de citas.
- **Acciones**: aprobar (libera los slots antiguos y asigna los nuevos); rechazar con
  motivo (libera la reserva provisional y mantiene la cita original).
- **Estados**: vacío · cargando por fila · 400 sin motivo · 409 si la solicitud ya fue
  resuelta o la cita cambió · 403 · 5xx.

## 16. CRUD de profesionales · `/admin/profesionales`, `/admin/profesionales/nuevo`, `/admin/profesionales/:id`

- **Actor**: ADMIN (RF-07).
- **Datos**: listado de profesionales con nombre, código profesional, matrícula,
  especialidades (marcando la primaria), sedes asignadas y estado activo/inactivo.
  Formulario de alta y edición con esos mismos campos.
- **Acciones**: crear el usuario PROFESSIONAL; editar código y matrícula; asignar una o
  varias especialidades y marcar la primaria; asignar una o ambas sedes; activar o
  desactivar. **No hay borrado físico.**
- **Estados**: vacío · cargando · 400 de validación por campo · 409 por duplicado de
  documento, email o matrícula · 403 · confirmación explícita al desactivar, explicando
  que deja de poder publicar agenda.

## 17. CRUD de especialidades · `/admin/especialidades` y CRUD de EPS/planes · `/admin/eps`, `/admin/eps/:id`

- **Actor**: ADMIN (RF-06).
- **Datos**:
  - Especialidades: nombre, duración de 30 o 60 minutos (RF-09) y estado activo.
  - EPS: nombre y estado. Planes de EPS: nombre, EPS a la que pertenecen y régimen
    (los regímenes son catálogo fijo de solo lectura, RF-05).
- **Acciones**: crear, editar y activar/desactivar. Los catálogos referenciados por
  transacciones **no se borran físicamente**: se desactivan.
- **Estados**: vacío · cargando · 400 de validación · **409 al intentar eliminar un
  catálogo referenciado**, con el mensaje del servidor y la alternativa de desactivar ·
  403 · éxito.

---

## Estado de implementación

Estado real al cierre de S4 (2026-09-25). Las rutas son las de `src/App.tsx`; las rutas
protegidas cuelgan de un prefijo por rol (`/paciente` USER, `/profesional` PROFESSIONAL,
`/admin` ADMIN) y `/` redirige al inicio del rol. Todas las pantallas llevan el diseño aprobado
de Stitch (S4).

| § | Pantalla | Ruta en la app | Estado |
| --- | --- | --- | --- |
| 1 | Registro | `/registro` | Implementada (S2; plan de afiliación opcional en S4) |
| 2 | Login | `/login` | Implementada (S2); con sesión ya abierta (p. ej. restaurada por la cookie, D36) redirige al inicio del rol o a la ruta de retorno (S4) |
| 3 | Recuperación de contraseña, paso 1 | `/recuperar-password` | Implementada (S2; token de laboratorio HU-006 en S4) |
| 3 | Recuperación de contraseña, paso 2 | `/restablecer-password?token=…` | Implementada (S4, HU-007) |
| 4 | Home / dashboard USER | `/paciente` | Implementada (S3; cancelar la próxima cita en S4) |
| 4 | Perfil y afiliación (acción de §4, RF-04) | `/paciente/perfil` | Implementada (S4, HU-008, HU-009) |
| 5–6 | Buscar disponibilidad y solicitar cita | `/paciente/agendar` (asistente de 4 pasos) | Implementada (S3) |
| 7 | Mis citas y detalle | `/paciente/citas`, `/paciente/citas/:id` | Implementada (S3; acciones e historial de reprogramación en S4, HU-028) |
| 8 | Cancelar cita (diálogo) | sobre `/paciente/citas/:id` y `/paciente` | Implementada (S4, HU-026) |
| 9 | Solicitar reprogramación | `/paciente/citas/:id/reprogramar` | Implementada (S4, HU-027) |
| 10 | Dashboard PROFESSIONAL | `/profesional` | Implementada (S3) |
| 11 | Gestionar bloques | `/profesional/agenda` (pestaña Bloques) | Implementada (S3) |
| 12 | Agenda del profesional y cierre de atención | `/profesional/agenda?vista=citas` (pestaña Citas) | Implementada (S4, HU-020, HU-021) |
| 13 | Dashboard ADMIN | `/admin` | Implementada (S3; contador de reprogramaciones en S4) |
| 14 | Aprobar / rechazar citas | `/admin/solicitudes?tipo=APPOINTMENT_REQUEST` | Implementada (S3) |
| 15 | Aprobar / rechazar reprogramaciones | `/admin/solicitudes?tipo=RESCHEDULE_REQUEST` | Implementada (S4, HU-029, HU-031) |
| 16 | CRUD de profesionales | `/admin/profesionales`, `/admin/profesionales/nuevo`, `/admin/profesionales/:id` | Implementada (S3) |
| 17 | CRUD de especialidades | `/admin/especialidades` | Implementada (S3) |
| 17 | CRUD de EPS y planes | `/admin/eps`, `/admin/eps/:id` | Implementada (S4, HU-012) |

Las bandejas de §14 y §15 son la misma pantalla (`InboxPage`) con el filtro "Tipo" en la
consulta `tipo`; sin él, `/admin/solicitudes` muestra ambos tipos.

Rutas y tipos REST están centralizados en `src/api/contracts.ts` y se reconcilian contra los
contratos de la wiki (`contrato-rest-identidad`, `contrato-rest-citas`).
