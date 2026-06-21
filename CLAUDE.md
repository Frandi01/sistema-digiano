# CLAUDE.md — Sistema Digiano Asesores

Contexto para Claude Code. Leé esto antes de tocar cualquier archivo.

---

## Qué es esto

Sistema de gestión interna para Digiano Asesores, productora de seguros (PAS) en La Plata. Lo usa Franco (dueño/admin) y su equipo de 5 personas. Cartera actual: ~270 clientes, ~760 pólizas activas (Auto, Hogar, Vida, Retiro, ART, RC, Caución, Comercio).

**Stack:** Node.js 22.5+ sin dependencias externas. SQLite nativo de Node. SPA vanilla JS. Sin npm install, sin compilación.

**URL producción:** https://panel.digianoasesores.com.ar  
**Deploy:** Railway (GitHub → auto-deploy en cada push a main)  
**Repo GitHub:** sistema-digiano  
**Carpeta local:** `C:\Users\frand\Claude\Projects\Digiano Asesores\sistema-digiano`

---

## Cómo correr localmente

```bash
node server/index.js
# Abre en http://localhost:8080
```

La base se crea sola en `data/digiano.db`. Para resetear: borrar la carpeta `data/`.

---

## Usuarios

| Rol | Usuario | Descripción |
|---|---|---|
| admin | `admin` | Franco. Ve y controla todo. |
| comercial | `luciano` | Tareas comerciales, cross-sell, seguimientos. |
| siniestros | `natalia` | **Solo siniestros.** No hace tareas comerciales. |

Contraseña inicial de todos: `Digiano2026`

---

## Estructura de archivos

```
server/
  index.js      — arranque, puerto 8080
  micro.js      — micro-framework HTTP (API compatible con Express)
  db.js         — esquema SQLite completo + migraciones idempotentes
  auth.js       — login, sesiones, roles, bloqueo, hash scrypt
  api.js        — rutas: auth, usuarios, dashboard, clientes, movimientos, CRM, score
  api2.js       — rutas: tareas, siniestros, objetivos, campañas, aprobaciones, auditoría
  api3.js       — rutas: solicitudes de cambio
  business.js   — lógica: oportunidades cross-sell, 5 tareas diarias, aplicar movimientos
  helpers.js    — score, auditoría, timeline, notificaciones, constantes (BRANCHES)
  seed.js       — datos iniciales (usuarios, score_config, datos de ejemplo)
  import-clientes.js — importa los 270 clientes reales desde clientes.json

public/
  index.html, styles.css
  js/api.js     — cliente HTTP del SPA
  js/ui.js      — componentes: toast, modal, icons, helpers de formato
  js/app.js     — SPA router, layout por rol, estado global
  js/views/
    dashboard.js   — KPIs, gráfico, ranking, actividad reciente
    clients.js     — lista y detalle de clientes, pólizas, historial, cross-sell
    movements.js   — altas y bajas de pólizas
    tasks.js       — tareas de hoy (comerciales) y tareas operativas
    claims.js      — siniestros (Natalia)
    commissions.js — liquidación de comisiones (admin)
    admin.js       — aprobaciones, usuarios, objetivos, campañas, ranking, métricas, avisos, auditoría, papelera
```

---

## Base de datos — tablas principales

- `users` — usuarios y roles (admin / comercial / siniestros)
- `clients` — clientes (fuente de verdad)
- `policies` — pólizas por cliente (branch, company, policy_number, premium, status)
- `movements` — altas y bajas (pendiente → aprobado)
- `tasks` — comerciales y operativas (kind: 'comercial' | 'operativa')
- `claims` + `claim_events` — siniestros con timeline
- `objectives` — metas por ramo con prioridad
- `campaigns` — campañas comerciales
- `score_events` + `score_config` — sistema de puntos y ranking
- `commission_periods` + `commission_lines` — liquidación mensual
- `notifications`, `audit_log`, `sessions`
- `avisos` + `aviso_reads` — circulares internas
- `change_requests` — aprobación de cambios sensibles
- `client_timeline` — historial unificado por cliente

---

## Lógica de negocio importante

**Tareas comerciales:** el sistema mantiene siempre 5 tareas comerciales activas por comercial, generadas automáticamente desde oportunidades de cross-sell. Los estados son: no_contactado → no_respondio → contactado → cotizacion_enviada → venta_cerrada / no_interesado / inviable. "Venta cerrada" genera un alta pendiente de aprobación. "Inviable" va a revisión del admin.

**Cross-sell:** se detecta automáticamente comparando los productos que tiene cada cliente contra los ramos disponibles (BRANCHES en helpers.js).

**Movimientos:** si los carga un no-admin quedan en status 'pendiente' hasta que el admin aprueba. Al aprobar se actualiza la póliza, el historial del cliente y el score.

**Score/Ranking:** contacto +2, interesado +5, cotización +8, venta/alta +25, baja recuperada +30, tarea +1, inviable aprobado +1, inviable rechazado −5.

**Renovaciones:** Franco renueva todo automáticamente. NO hay alertas de vencimiento de pólizas. Solo baja quien pide explícitamente la baja.

---

## Rutas API principales

Todas bajo `/api`, requieren cookie de sesión (`sid`). Roles: admin, comercial, siniestros.

- `POST /api/auth/login` — login
- `GET /api/dashboard` — KPIs del mes
- `GET/POST /api/clients` — lista y creación de clientes
- `GET /api/clients/:id` — detalle con pólizas, historial, siniestros
- `GET/POST /api/movements` — movimientos (altas/bajas)
- `POST /api/movements/:id/approve` — aprobar movimiento (admin)
- `GET /api/tasks/today` — tareas comerciales del día
- `POST /api/tasks/:id/result` — registrar resultado de tarea
- `GET/POST /api/claims` — siniestros
- `GET/POST /api/objectives` — objetivos
- `GET/POST /api/campaigns` — campañas
- `GET /api/users` — usuarios (admin)
- `POST /api/score/reset-user/:id` — resetear puntos de un usuario (admin)
- `GET /api/metrics` — embudo de conversión
- `GET /api/ranking` — ranking del equipo
- `GET /api/audit` — log de auditoría

---

## Decisiones de diseño tomadas (no cambiar sin consultar)

- Sin dependencias externas — no agregar npm packages sin necesidad real
- Puerto 8080 en producción (variable de entorno PORT, Railway lo usa así)
- `DATA_DIR=/data` en Railway para disco persistente; localmente usa `./data/`
- Autenticación por username (no email) — se migró en versión anterior
- Los no-admin no pueden aprobar sus propios movimientos

---

## Deploy

1. Hacer cambios localmente
2. GitHub Desktop → Commit → Push
3. Railway redeploya automáticamente en 2-3 minutos

Para ver logs de producción: railway.com → proyecto sistema-digiano → Deploy Logs

---

## Contexto del negocio

- Facturación actual: ~$4.000.000/mes (comisiones netas)
- Objetivo: $16.000.000/mes en 12 meses
- Prioridades: 1) frenar fuga de clientes, 2) cross-sell en cartera, 3) cuentas corporativas
- Natalia hace solo siniestros, no tareas comerciales
- Las renovaciones son automáticas — no generar alertas de vencimiento
