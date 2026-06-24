# Sistema Digiano Asesores

Aplicación web de gestión interna para una oficina/productora de seguros. Sin integración con APIs de compañías: la información se carga manualmente, pero el sistema mantiene la consistencia automáticamente (el perfil del cliente es la fuente de verdad y los movimientos lo actualizan solos).

Construida **sin dependencias externas**: usa el servidor HTTP, el SQLite y el `crypto` nativos de Node. No requiere `npm install` ni compilar nada.

---

## Cómo ejecutarlo

Requisito: **Node.js 22.5 o superior** (trae SQLite nativo). Verificá con `node -v`.

Desde la carpeta `sistema-digiano`:

```bash
node server/index.js
```

Luego abrí el navegador en **http://localhost:3000**

La base de datos se crea sola la primera vez (`data/digiano.db`) y carga automáticamente tu **cartera real** (270 clientes con sus productos, desde `server/clientes.json`). Para empezar de cero, borrá la carpeta `data/` y volvé a iniciar.

### Cargar la cartera en una base que ya existe

Si ya habías iniciado el sistema antes (y por eso tiene los clientes de ejemplo viejos), corré una sola vez:

```bash
node server/import-clientes.js
```

Esto borra los clientes de demostración, importa los 270 reales (sin duplicar) y deja el sistema listo.

### Usuarios de ejemplo (el login es por **nombre de usuario**)

La contraseña inicial se define con la variable de entorno **`SEED_PASSWORD`** al desplegar. No hay ninguna contraseña por defecto en el código ni en esta documentación. Todos los usuarios deben cambiarla en el primer ingreso.

| Rol | Usuario | Para qué |
|---|---|---|
| Administrador | `admin` | Ve y controla todo |
| Comercial (Luciano) | `luciano` | Tareas de hoy, seguimientos, siniestros, su comisión |
| Siniestros (Natalia) | `natalia` | Siniestros, clientes, altas/bajas, su comisión |

El email queda como dato secundario del usuario (ya no se usa para entrar). **Todos los usuarios tienen cambio de contraseña obligatorio en el primer ingreso** (incluido el admin).

> Si ya tenías una base creada de una versión anterior, al iniciar se migra sola: agrega las columnas y tablas nuevas y deriva el nombre de usuario desde el email (admin, luciano, natalia). No perdés datos.

---

## Qué incluye

**Seguridad y acceso**
- Login cerrado (no hay registro público). Los usuarios los crea solo el administrador.
- Contraseñas con hash `scrypt` + salt. Política de fortaleza mínima.
- Bloqueo de cuenta tras 5 intentos fallidos (15 min). Cierre de sesión por inactividad (30 min).
- Cambio de contraseña obligatorio en el primer ingreso. Reseteo por el administrador.
- Auditoría de logins y acciones importantes. Los usuarios se desactivan, no se eliminan.

**Dashboard general (común a todos los roles)**
- Objetivo actual con barra de avance, días restantes y comisión generada/proyectada.
- Movimiento del mes: altas, bajas, crecimiento neto, comisión extra, ramo top.
- Tablero de posiciones del equipo (ranking por score interno).

**Clientes (fuente de verdad)**
- Perfil con datos, etiquetas, observaciones, productos/pólizas, siniestros e historial cronológico unificado.
- Las altas/bajas actualizan el perfil automáticamente (una sola carga, sin duplicar).

**Altas y bajas**
- Carga única que crea/da de baja la póliza, alimenta métricas, historial y score.
- Si las carga un no-admin, quedan pendientes de aprobación (sin volver a cargar nada).

**CRM inteligente**
- Detecta oportunidades de cross-sell automáticamente desde los productos faltantes de cada cliente (ej.: tiene Auto pero no Hogar).
- Alimenta las tareas comerciales diarias y las campañas.

**Tareas comerciales de Luciano**
- El sistema mantiene siempre **5 tareas comerciales activas** por día, generadas desde las oportunidades.
- Resultados: no contactado, no respondió, contactado, cotización enviada, venta cerrada, no interesado, inviable (con motivos).
- Venta cerrada → genera el alta automática (a aprobar). Cotización enviada → pasa a la bandeja de seguimientos. Inviable → va a revisión del admin. Las tareas no se cierran hasta tener resultado definitivo y se recompletan a 5.

**Tareas operativas** creadas por el empleado o asignadas por el admin (mandar póliza, pedir documentación, etc.) con estados.

**Siniestros (Natalia)**
- Cualquier usuario crea un siniestro → notifica automáticamente a Siniestros y queda en el historial del cliente.
- Estados (abierto, documentación pendiente, presentado, en análisis, liquidado, cerrado) y línea de tiempo de novedades.

**Score y ranking** configurable: contacto +2, interesado +5, cotización +8, venta/alta +25, baja recuperada +30, tarea +1, inviable aprobado +1, inviable rechazado −5.

**Campañas**, **centro de aprobaciones**, **auditoría** y **notificaciones**.

---

## Modelo de datos (SQLite)

Entidades principales y relaciones:

- **users** — usuarios y roles (admin / comercial / siniestros).
- **clients** ← **policies** (productos contratados), **movements** (altas/bajas), **claims** (siniestros), **client_timeline** (historial unificado).
- **tasks** — comerciales (con `offer`, `result`, `reason`, `active`) y operativas; ligadas a cliente y usuario.
- **claims** ← **claim_events** (timeline del siniestro).
- **objectives**, **campaigns** — metas y campañas.
- **score_events** + **score_config** — alimentan el ranking.
- **notifications**, **audit_log**, **sessions**.

El perfil del cliente concentra todo: al registrar un movimiento se actualizan póliza, historial, métricas y score en una sola acción.

---

## Estructura del proyecto

```
sistema-digiano/
  server/
    index.js      arranque del servidor
    micro.js      micro-framework HTTP (compatible con Express, sin dependencias)
    db.js         esquema SQLite
    auth.js       login, sesiones, roles, seguridad
    api.js        API: auth, usuarios, dashboard, clientes, movimientos, CRM
    api2.js       API: tareas, siniestros, objetivos, campañas, aprobaciones, auditoría
    business.js   lógica: oportunidades, 5 tareas diarias, aplicar altas/bajas
    helpers.js    score, auditoría, timeline, notificaciones
    seed.js       datos de ejemplo
  public/
    index.html, styles.css
    js/app.js     SPA: router, layout por rol, login
    js/views/     dashboard, clientes, movimientos, tareas, siniestros, admin
  data/           base de datos (se crea sola)
```

---

## Notas para producción

Es un MVP funcional pensado para uso interno en red local. Antes de exponerlo a internet conviene: servir por HTTPS, mover el secreto de cookies/sesión a variables de entorno, y hacer backups periódicos de `data/digiano.db`. El segundo factor de autenticación (2FA) para el administrador está contemplado en el diseño y puede agregarse sobre el flujo de login actual.
