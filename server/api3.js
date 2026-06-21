// API parte 3: comisiones, avisos/circulares, notificaciones por seccion,
// solicitudes de cambio (aprobaciones), papelera (edit/borrar/restaurar),
// metricas de conversion y acciones masivas.
import express from './micro.js';
import db from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { audit, notify, notifyRole, addScore, timeline } from './helpers.js';
import { applyMovement } from './business.js';

const router = express.Router();
const now = () => new Date().toISOString();

/* ============================================================
   COMISIONES
   ============================================================ */
function userIdByUsername(u) {
  const r = db.prepare('SELECT id FROM users WHERE username=?').get(u);
  return r ? r.id : null;
}

const COMMISSION_DEFAULTS = {
  suma1: 0, suma2: 0, suma3: 0, marketing: 0, gastos_varios: 0,
  c_rubrica: 15000, c_contador: 50000, c_monotributo: 285678.23, c_luciano_fijo: 100000,
  reserva_pct: 0.05, pct_fernando: 0.45, pct_natalia: 0.15, pct_grupo: 0.40, factor_luciano: 0.17, extraordinario: 0,
};

// Replica la logica del Excel: neto = transferido - gastos; reparto.
export function computeCommission(p) {
  const transferido = (p.suma1 || 0) + (p.suma2 || 0) + (p.suma3 || 0);
  const reserva = transferido * (p.reserva_pct ?? 0.05);
  const gastos = (p.c_rubrica || 0) + (p.c_contador || 0) + (p.c_monotributo || 0) +
    (p.c_luciano_fijo || 0) + (p.marketing || 0) + (p.gastos_varios || 0) + reserva;
  const base = transferido - gastos;
  const grupo = base * (p.pct_grupo ?? 0.40);
  const lucianoPct = grupo * (p.factor_luciano ?? 0.17);
  const franco = grupo - lucianoPct;
  // Luciano cobra su porcentaje + el pago fijo "Luciano fijo" (que se descuenta como gasto).
  const luciano = lucianoPct + (p.c_luciano_fijo || 0);
  const fernando = base * (p.pct_fernando ?? 0.45);
  const natalia = base * (p.pct_natalia ?? 0.15);
  return {
    transferido, reserva, gastos, base,
    extraordinario: p.extraordinario || 0,
    computable: transferido - (p.extraordinario || 0),
    lines: [
      { person: 'Fernando', username: null, amount: fernando },
      { person: 'Franco', username: 'admin', amount: franco },
      { person: 'Natalia', username: 'natalia', amount: natalia },
      { person: 'Luciano', username: 'luciano', amount: luciano },
    ],
  };
}

function saveLines(periodId, calc) {
  db.prepare('DELETE FROM commission_lines WHERE period_id=?').run(periodId);
  const ins = db.prepare('INSERT INTO commission_lines (period_id,person,user_id,amount) VALUES (?,?,?,?)');
  for (const l of calc.lines) ins.run(periodId, l.person, l.username ? userIdByUsername(l.username) : null, l.amount);
}

// Listado (admin)
router.get('/commissions', requireAuth, requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM commission_periods ORDER BY period DESC').all();
  const out = rows.map((p) => {
    const c = computeCommission(p);
    return { ...p, transferido: c.transferido, base: c.base, total_repartido: c.base };
  });
  res.json({ periods: out });
});

// Lo que gano CADA empleado (su propio historico). No ve a los demas.
// (Definido antes de /commissions/:id para que no lo capture la ruta con parametro.)
router.get('/commissions/mine/list', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT cp.period, cp.status, cl.amount, cp.extraordinario
     FROM commission_lines cl JOIN commission_periods cp ON cp.id=cl.period_id
     WHERE cl.user_id=? AND cp.status != 'borrador'
     ORDER BY cp.period DESC`
  ).all(req.user.id);
  res.json({ items: rows });
});

// Evolucion mensual (para grafico del dashboard).
router.get('/commissions/evolution', requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM commission_periods WHERE status != 'borrador' ORDER BY period").all();
  const series = rows.map((p) => {
    const c = computeCommission(p);
    return {
      period: p.period,
      real_cobrada: req.user.role === 'admin' ? c.transferido : null,
      extraordinario: req.user.role === 'admin' ? c.extraordinario : null,
      computable: c.computable,
      base: req.user.role === 'admin' ? c.base : null,
    };
  });
  res.json({ series });
});

// Detalle (admin) -- la ruta con :id va DESPUES de las rutas con nombre fijo.
router.get('/commissions/:id', requireAuth, requireRole('admin'), (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: 'No existe.' });
  const p = db.prepare('SELECT * FROM commission_periods WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe.' });
  const calc = computeCommission(p);
  const lines = db.prepare('SELECT * FROM commission_lines WHERE period_id=?').all(p.id);
  res.json({ period: p, calc, lines });
});

// Crear (admin)
router.post('/commissions', requireAuth, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.period) return res.status(400).json({ error: 'Indique el periodo (YYYY-MM).' });
  const cols = ['period', 'suma1', 'suma2', 'suma3', 'marketing', 'gastos_varios', 'c_rubrica', 'c_contador',
    'c_monotributo', 'c_luciano_fijo', 'reserva_pct', 'pct_fernando', 'pct_natalia', 'pct_grupo', 'factor_luciano', 'extraordinario'];
  const prev = db.prepare('SELECT * FROM commission_periods ORDER BY period DESC LIMIT 1').get() || {};
  const num = (v) => (v === '' || v == null ? null : Number(v));
  const vals = cols.map((c) => {
    if (c === 'period') return b.period;
    const v = num(b[c]);
    if (v != null) return v;
    const pv = num(prev[c]);
    if (pv != null) return pv;
    return COMMISSION_DEFAULTS[c];
  });
  try {
    const info = db.prepare(
      `INSERT INTO commission_periods (${cols.join(',')},status,created_by) VALUES (${cols.map(() => '?').join(',')},'calculado',?)`
    ).run(...vals, req.user.id);
    const p = db.prepare('SELECT * FROM commission_periods WHERE id=?').get(info.lastInsertRowid);
    saveLines(p.id, computeCommission(p));
    audit(req.user.id, 'crear_liquidacion', 'commission', p.id, p.period);
    res.json({ id: p.id });
  } catch (e) {
    res.status(400).json({ error: 'Ese periodo ya existe.' });
  }
});

// Editar (admin). Bloqueado si pagado.
router.put('/commissions/:id', requireAuth, requireRole('admin'), (req, res) => {
  const p = db.prepare('SELECT * FROM commission_periods WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe.' });
  if (p.status === 'pagado') return res.status(400).json({ error: 'Liquidacion pagada: no editable.' });
  const b = req.body || {};
  const fields = ['suma1', 'suma2', 'suma3', 'marketing', 'gastos_varios', 'c_rubrica', 'c_contador',
    'c_monotributo', 'c_luciano_fijo', 'reserva_pct', 'pct_fernando', 'pct_natalia', 'pct_grupo', 'factor_luciano', 'extraordinario'];
  const sets = []; const args = [];
  for (const f of fields) if (b[f] !== undefined) { sets.push(`${f}=?`); args.push(b[f]); }
  if (sets.length) {
    db.prepare(`UPDATE commission_periods SET ${sets.join(',')}, updated_at=datetime('now') WHERE id=?`).run(...args, p.id);
  }
  const fresh = db.prepare('SELECT * FROM commission_periods WHERE id=?').get(p.id);
  saveLines(fresh.id, computeCommission(fresh));
  audit(req.user.id, 'editar_liquidacion', 'commission', p.id, null);
  res.json({ ok: true });
});

// Borrar liquidacion (admin). Elimina el periodo y sus lineas.
router.delete('/commissions/:id', requireAuth, requireRole('admin'), (req, res) => {
  const p = db.prepare('SELECT * FROM commission_periods WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe.' });
  db.prepare('DELETE FROM commission_lines WHERE period_id=?').run(p.id);
  db.prepare('DELETE FROM commission_periods WHERE id=?').run(p.id);
  audit(req.user.id, 'borrar_liquidacion', 'commission', p.id, p.period);
  res.json({ ok: true });
});

// Cambiar estado
router.post('/commissions/:id/status', requireAuth, requireRole('admin'), (req, res) => {
  const p = db.prepare('SELECT * FROM commission_periods WHERE id=?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'No existe.' });
  const status = req.body?.status;
  if (!['borrador', 'calculado', 'cerrado', 'pagado'].includes(status)) return res.status(400).json({ error: 'Estado invalido.' });
  db.prepare("UPDATE commission_periods SET status=?, updated_at=datetime('now') WHERE id=?").run(status, p.id);
  audit(req.user.id, 'estado_liquidacion', 'commission', p.id, status);
  res.json({ ok: true });
});

/* ============================================================
   AVISOS / CIRCULARES
   ============================================================ */
function avisosForUser(u) {
  return db.prepare(
    `SELECT a.*,
       (SELECT COUNT(*) FROM aviso_reads r WHERE r.aviso_id=a.id AND r.user_id=?) AS leido,
       (SELECT name FROM users us WHERE us.id=a.created_by) AS author
     FROM avisos a
     WHERE a.active=1 AND (a.audience='todos' OR a.audience=? OR (a.audience='user' AND a.target_user_id=?))
     ORDER BY a.pinned DESC, a.created_at DESC`
  ).all(u.id, u.role, u.id);
}

router.get('/avisos', requireAuth, (req, res) => {
  res.json({ avisos: avisosForUser(req.user) });
});

router.post('/avisos/:id/read', requireAuth, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO aviso_reads (aviso_id,user_id) VALUES (?,?)').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

router.get('/avisos/manage', requireAuth, requireRole('admin'), (req, res) => {
  res.json({ avisos: db.prepare('SELECT * FROM avisos ORDER BY active DESC, pinned DESC, created_at DESC').all() });
});

router.post('/avisos', requireAuth, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  if (!b.title) return res.status(400).json({ error: 'Falta el titulo.' });
  const info = db.prepare(
    `INSERT INTO avisos (title,body,priority,audience,target_user_id,pinned,active,created_by)
     VALUES (?,?,?,?,?,?,1,?)`
  ).run(b.title, b.body || null, b.priority || 'normal', b.audience || 'todos',
    b.audience === 'user' ? (b.target_user_id || null) : null, b.pinned ? 1 : 0, req.user.id);
  audit(req.user.id, 'crear_aviso', 'aviso', info.lastInsertRowid, b.title);
  res.json({ id: info.lastInsertRowid });
});

router.put('/avisos/:id', requireAuth, requireRole('admin'), (req, res) => {
  const a = db.prepare('SELECT * FROM avisos WHERE id=?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'No existe.' });
  const b = req.body || {};
  db.prepare(
    `UPDATE avisos SET title=COALESCE(?,title), body=COALESCE(?,body), priority=COALESCE(?,priority),
       audience=COALESCE(?,audience), target_user_id=?, pinned=COALESCE(?,pinned), active=COALESCE(?,active) WHERE id=?`
  ).run(b.title ?? null, b.body ?? null, b.priority ?? null, b.audience ?? null,
    b.target_user_id ?? a.target_user_id, b.pinned === undefined ? null : (b.pinned ? 1 : 0),
    b.active === undefined ? null : (b.active ? 1 : 0), a.id);
  audit(req.user.id, 'editar_aviso', 'aviso', a.id, null);
  res.json({ ok: true });
});

/* ============================================================
   NOTIFICACIONES POR SECCION (puntitos del menu)
   ============================================================ */
function seenOf(userId, section) {
  const r = db.prepare('SELECT last_seen FROM section_seen WHERE user_id=? AND section=?').get(userId, section);
  return r ? r.last_seen : '1970-01-01';
}

router.get('/sections/counts', requireAuth, (req, res) => {
  const u = req.user;
  const c = {};
  c['tareas-hoy'] = db.prepare(
    "SELECT COUNT(*) n FROM tasks WHERE assigned_to=? AND kind='comercial' AND active=1 AND COALESCE(deleted,0)=0 AND created_at > ?"
  ).get(u.id, seenOf(u.id, 'tareas-hoy')).n;
  c['tareas'] = db.prepare(
    "SELECT COUNT(*) n FROM tasks WHERE kind='operativa' AND assigned_to=? AND status!='completada' AND COALESCE(deleted,0)=0 AND created_at > ?"
  ).get(u.id, seenOf(u.id, 'tareas')).n;
  c['seguimientos'] = db.prepare(
    "SELECT COUNT(*) n FROM tasks WHERE assigned_to=? AND result='cotizacion_enviada' AND status!='completada' AND COALESCE(deleted,0)=0 AND created_at > ?"
  ).get(u.id, seenOf(u.id, 'seguimientos')).n;
  if (u.role === 'siniestros' || u.role === 'admin') {
    const seen = seenOf(u.id, 'siniestros');
    c['siniestros'] = db.prepare(
      `SELECT COUNT(DISTINCT cl.id) n FROM claims cl
       WHERE cl.status!='cerrado' AND (cl.created_at > ? OR EXISTS (SELECT 1 FROM claim_events e WHERE e.claim_id=cl.id AND e.created_at > ?))`
    ).get(seen, seen).n;
  }
  if (u.role === 'admin') {
    const mv = db.prepare("SELECT COUNT(*) n FROM movements WHERE status='pendiente'").get().n;
    const cls = db.prepare("SELECT COUNT(*) n FROM clients WHERE status='pendiente'").get().n;
    const inv = db.prepare("SELECT COUNT(*) n FROM tasks WHERE result='inviable' AND COALESCE(deleted,0)=0 AND reason NOT LIKE '%aprobado%' AND reason NOT LIKE '%rechazado%'").get().n;
    const ch = db.prepare("SELECT COUNT(*) n FROM change_requests WHERE status='pendiente'").get().n;
    c['aprobaciones'] = mv + cls + inv + ch;
  }
  // avisos no leidos
  c['avisos'] = avisosForUser(u).filter((a) => !a.leido).length;
  res.json({ counts: c });
});

router.post('/sections/seen', requireAuth, (req, res) => {
  const section = req.body?.section;
  if (!section) return res.status(400).json({ error: 'Falta seccion.' });
  db.prepare(
    `INSERT INTO section_seen (user_id,section,last_seen) VALUES (?,?,datetime('now'))
     ON CONFLICT(user_id,section) DO UPDATE SET last_seen=datetime('now')`
  ).run(req.user.id, section);
  res.json({ ok: true });
});

/* ============================================================
   ACTIVIDAD RECIENTE (centro de actividad del dashboard)
   ============================================================ */
router.get('/activity', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT a.action, a.entity_type, a.entity_id, a.detail, a.created_at, u.name AS user_name
     FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
     WHERE a.action NOT IN ('login','login_fallido','cambio_password')
     ORDER BY a.created_at DESC LIMIT 25`
  ).all();
  res.json({ activity: rows });
});

/* ============================================================
   SOLICITUDES DE CAMBIO (aprobacion de cambios sensibles)
   ============================================================ */
export function createChangeRequest({ type, entityType, entityId, clientId, payload, summary, userId }) {
  const info = db.prepare(
    `INSERT INTO change_requests (type,entity_type,entity_id,client_id,payload,summary,requested_by)
     VALUES (?,?,?,?,?,?,?)`
  ).run(type, entityType || null, entityId || null, clientId || null, JSON.stringify(payload || {}), summary || null, userId);
  notifyRole('admin', `Cambio pendiente de aprobacion: ${summary || type}`, '#/aprobaciones');
  audit(userId, 'solicitar_cambio', entityType || type, entityId || null, summary || null);
  return info.lastInsertRowid;
}

router.get('/change-requests', requireAuth, requireRole('admin'), (req, res) => {
  const rows = db.prepare(
    `SELECT cr.*, u.name AS requested_name, c.name AS client_name FROM change_requests cr
     LEFT JOIN users u ON u.id=cr.requested_by LEFT JOIN clients c ON c.id=cr.client_id
     WHERE cr.status='pendiente' ORDER BY cr.created_at`
  ).all();
  res.json({ requests: rows });
});

router.post('/change-requests/:id/resolve', requireAuth, requireRole('admin'), (req, res) => {
  const cr = db.prepare('SELECT * FROM change_requests WHERE id=?').get(req.params.id);
  if (!cr || cr.status !== 'pendiente') return res.status(400).json({ error: 'No aplicable.' });
  const decision = req.body?.decision;
  if (decision === 'aprobar') {
    const payload = JSON.parse(cr.payload || '{}');
    if (cr.type === 'cliente_editar' && cr.client_id) {
      db.prepare('UPDATE clients SET name=COALESCE(?,name), phone=?, email=?, observations=?, tags=? WHERE id=?')
        .run(payload.name ?? null, payload.phone ?? null, payload.email ?? null, payload.observations ?? null, payload.tags ?? null, cr.client_id);
      timeline(cr.client_id, 'observacion', 'Datos del cliente actualizados (aprobado)', req.user.id, 'client', cr.client_id);
    }
    db.prepare("UPDATE change_requests SET status='aprobado', resolved_by=?, resolved_at=datetime('now') WHERE id=?").run(req.user.id, cr.id);
    notify(cr.requested_by, `Tu cambio fue aprobado: ${cr.summary || ''}`, cr.client_id ? '#/clientes/' + cr.client_id : '#/');
  } else if (decision === 'rechazar') {
    db.prepare("UPDATE change_requests SET status='rechazado', resolved_by=?, resolved_at=datetime('now') WHERE id=?").run(req.user.id, cr.id);
    notify(cr.requested_by, `Tu cambio fue rechazado: ${cr.summary || ''}`, null);
  } else return res.status(400).json({ error: 'Decision invalida.' });
  audit(req.user.id, 'resolver_cambio', 'change_request', cr.id, decision);
  res.json({ ok: true });
});

/* ============================================================
   EDITAR / BORRAR (soft) + PAPELERA
   ============================================================ */
function softDelete(table, id, userId) {
  db.prepare(`UPDATE ${table} SET deleted=1, deleted_by=?, deleted_at=datetime('now') WHERE id=?`).run(userId, id);
}

router.put('/tasks/:id/edit', requireAuth, requireRole('admin'), (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'No existe.' });
  const b = req.body || {};
  db.prepare('UPDATE tasks SET title=COALESCE(?,title), assigned_to=COALESCE(?,assigned_to), due_date=?, client_id=? WHERE id=?')
    .run(b.title ?? null, b.assigned_to ?? null, b.due_date ?? null, b.client_id ?? t.client_id, t.id);
  audit(req.user.id, 'editar_tarea', 'task', t.id, null);
  res.json({ ok: true });
});

router.delete('/tasks/:id', requireAuth, requireRole('admin'), (req, res) => {
  softDelete('tasks', req.params.id, req.user.id);
  audit(req.user.id, 'borrar_tarea', 'task', Number(req.params.id), null);
  res.json({ ok: true });
});
router.delete('/campaigns/:id', requireAuth, requireRole('admin'), (req, res) => {
  softDelete('campaigns', req.params.id, req.user.id);
  audit(req.user.id, 'borrar_campana', 'campaign', Number(req.params.id), null);
  res.json({ ok: true });
});
router.delete('/objectives/:id', requireAuth, requireRole('admin'), (req, res) => {
  softDelete('objectives', req.params.id, req.user.id);
  audit(req.user.id, 'borrar_objetivo', 'objective', Number(req.params.id), null);
  res.json({ ok: true });
});

router.put('/campaigns/:id', requireAuth, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE campaigns SET name=COALESCE(?,name), branch=?, target_product=?, goal=COALESCE(?,goal), priority=COALESCE(?,priority), start_date=?, end_date=?, active=COALESCE(?,active) WHERE id=?')
    .run(b.name ?? null, b.branch ?? null, b.target_product ?? null, b.goal ?? null, b.priority ?? null, b.start_date ?? null, b.end_date ?? null,
      b.active === undefined ? null : (b.active ? 1 : 0), req.params.id);
  audit(req.user.id, 'editar_campana', 'campaign', Number(req.params.id), null);
  res.json({ ok: true });
});
router.put('/objectives/:id', requireAuth, requireRole('admin'), (req, res) => {
  const b = req.body || {};
  db.prepare('UPDATE objectives SET name=COALESCE(?,name), branch=?, target=COALESCE(?,target), avg_commission=COALESCE(?,avg_commission), priority=COALESCE(?,priority), start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date), active=COALESCE(?,active) WHERE id=?')
    .run(b.name ?? null, b.branch ?? null, b.target ?? null, b.avg_commission ?? null, b.priority ?? null, b.start_date ?? null, b.end_date ?? null,
      b.active === undefined ? null : (b.active ? 1 : 0), req.params.id);
  audit(req.user.id, 'editar_objetivo', 'objective', Number(req.params.id), null);
  res.json({ ok: true });
});

router.get('/trash', requireAuth, requireRole('admin'), (req, res) => {
  const q = (table, label) => db.prepare(
    `SELECT t.id, t.deleted_at, u.name AS deleted_name, '${label}' AS tipo,
       ${table === 'tasks' ? 't.title' : 't.name'} AS nombre
     FROM ${table} t LEFT JOIN users u ON u.id=t.deleted_by WHERE t.deleted=1 ORDER BY t.deleted_at DESC`
  ).all();
  res.json({ tasks: q('tasks', 'tarea'), campaigns: q('campaigns', 'campana'), objectives: q('objectives', 'objetivo') });
});

router.post('/trash/restore', requireAuth, requireRole('admin'), (req, res) => {
  const { type, id } = req.body || {};
  const table = { tarea: 'tasks', campana: 'campaigns', objetivo: 'objectives' }[type];
  if (!table) return res.status(400).json({ error: 'Tipo invalido.' });
  db.prepare(`UPDATE ${table} SET deleted=0, deleted_by=NULL, deleted_at=NULL WHERE id=?`).run(id);
  audit(req.user.id, 'restaurar', table, Number(id), null);
  res.json({ ok: true });
});

/* ============================================================
   METRICAS DE CONVERSION
   ============================================================ */
router.get('/metrics', requireAuth, requireRole('admin'), (req, res) => {
  const one = (sql, ...a) => db.prepare(sql).get(...a).n;
  const asign = one("SELECT COUNT(*) n FROM tasks WHERE kind='comercial' AND COALESCE(deleted,0)=0");
  const contactados = one("SELECT COUNT(*) n FROM tasks WHERE kind='comercial' AND result IN ('contactado','cotizacion_enviada','venta_cerrada','no_interesado')");
  const cotiz = one("SELECT COUNT(*) n FROM tasks WHERE kind='comercial' AND result IN ('cotizacion_enviada','venta_cerrada')");
  const ventas = one("SELECT COUNT(*) n FROM tasks WHERE kind='comercial' AND result='venta_cerrada'");
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const byReason = (r) => db.prepare(`SELECT COALESCE(reason,'(sin motivo)') reason, COUNT(*) n FROM tasks WHERE result=? AND COALESCE(deleted,0)=0 GROUP BY reason ORDER BY n DESC`).all(r);
  const byRamo = db.prepare(`SELECT offer ramo, COUNT(*) tot, SUM(CASE WHEN result='venta_cerrada' THEN 1 ELSE 0 END) ventas FROM tasks WHERE kind='comercial' AND offer IS NOT NULL GROUP BY offer ORDER BY tot DESC`).all();
  const byEmp = db.prepare(
    `SELECT u.name, COUNT(*) asign,
       SUM(CASE WHEN t.result IN ('contactado','cotizacion_enviada','venta_cerrada','no_interesado') THEN 1 ELSE 0 END) contactados,
       SUM(CASE WHEN t.result='venta_cerrada' THEN 1 ELSE 0 END) ventas
     FROM tasks t JOIN users u ON u.id=t.assigned_to WHERE t.kind='comercial' GROUP BY u.id ORDER BY ventas DESC`
  ).all();
  res.json({
    funnel: { asignadas: asign, contactados, cotizaciones: cotiz, ventas,
      conv_contacto: pct(contactados, asign), conv_cotizacion: pct(cotiz, contactados), conv_venta: pct(ventas, cotiz) },
    no_interesado: byReason('no_interesado'),
    inviable: byReason('inviable'),
    por_ramo: byRamo.map((r) => ({ ...r, conv: pct(r.ventas, r.tot) })),
    por_empleado: byEmp.map((e) => ({ ...e, conv: pct(e.ventas, e.asign) })),
  });
});

/* ============================================================
   ACCIONES MASIVAS
   ============================================================ */
router.post('/tasks/bulk', requireAuth, requireRole('admin'), (req, res) => {
  const { ids, action, value } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'Sin tareas seleccionadas.' });
  const ph = ids.map(() => '?').join(',');
  if (action === 'asignar' || action === 'reasignar') {
    db.prepare(`UPDATE tasks SET assigned_to=? WHERE id IN (${ph})`).run(value, ...ids);
  } else if (action === 'estado') {
    db.prepare(`UPDATE tasks SET status=? WHERE id IN (${ph})`).run(value, ...ids);
  } else if (action === 'archivar') {
    db.prepare(`UPDATE tasks SET deleted=1, deleted_by=?, deleted_at=datetime('now') WHERE id IN (${ph})`).run(req.user.id, ...ids);
  } else return res.status(400).json({ error: 'Accion invalida.' });
  audit(req.user.id, 'masiva_tareas', 'task', null, `${action} x${ids.length}`);
  res.json({ ok: true, count: ids.length });
});

router.post('/campaigns/:id/close', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('UPDATE campaigns SET active=0 WHERE id=?').run(req.params.id);
  audit(req.user.id, 'cerrar_campana', 'campaign', Number(req.params.id), null);
  res.json({ ok: true });
});

/* ============================================================
   BUSCADOR GLOBAL DE CLIENTES (nombre / numero de poliza)
   ============================================================ */
router.get('/search/clients', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ clients: [] });
  const like = `%${q}%`;
  const rows = db.prepare(
    `SELECT DISTINCT c.id, c.name, c.phone FROM clients c
     LEFT JOIN policies p ON p.client_id=c.id
     WHERE c.name LIKE ? OR p.policy_number LIKE ?
     ORDER BY c.name LIMIT 20`
  ).all(like, like);
  res.json({ clients: rows });
});

export default router;
