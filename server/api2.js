// API parte 2: tareas, seguimientos, siniestros, objetivos, campanas,
// aprobaciones, score, auditoria y notificaciones.
import express from './micro.js';
import db from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { addScore, audit, timeline, notify, notifyRole, LABELS } from './helpers.js';
import { ensureDailyTasks, applyMovement } from './business.js';

const router = express.Router();

/* =================== TAREAS =================== */
// Tareas comerciales de hoy (5 activas). El comercial ve las suyas.
router.get('/tasks/today', requireAuth, (req, res) => {
  const userId = req.user.role === 'admin' && req.query.user ? Number(req.query.user) : req.user.id;
  const target = db.prepare('SELECT * FROM users WHERE id=?').get(userId);
  if (target && (target.role === 'comercial' || target.role === 'admin')) ensureDailyTasks(userId);
  const tasks = db.prepare(
    `SELECT t.*, c.name AS client_name, c.phone, c.email
     FROM tasks t LEFT JOIN clients c ON c.id=t.client_id
     WHERE t.assigned_to=? AND t.kind='comercial' AND t.active=1 AND COALESCE(t.deleted,0)=0
     ORDER BY t.created_at`
  ).all(userId);
  res.json({ tasks });
});

// Bandeja de seguimientos (cotizaciones enviadas, esperando respuesta).
router.get('/tasks/followups', requireAuth, (req, res) => {
  const userId = req.user.role === 'admin' && req.query.user ? Number(req.query.user) : req.user.id;
  const tasks = db.prepare(
    `SELECT t.*, c.name AS client_name, c.phone FROM tasks t LEFT JOIN clients c ON c.id=t.client_id
     WHERE t.assigned_to=? AND t.result='cotizacion_enviada' AND t.status!='completada' AND COALESCE(t.deleted,0)=0
     ORDER BY t.follow_up_date`
  ).all(userId);
  res.json({ tasks });
});

// Tareas operativas (creadas por el usuario o asignadas por admin).
router.get('/tasks/operativas', requireAuth, (req, res) => {
  let rows;
  if (req.user.role === 'admin') {
    rows = db.prepare(
      `SELECT t.*, c.name AS client_name, u.name AS assigned_name
       FROM tasks t LEFT JOIN clients c ON c.id=t.client_id LEFT JOIN users u ON u.id=t.assigned_to
       WHERE t.kind='operativa' AND COALESCE(t.deleted,0)=0 ORDER BY t.status, t.due_date`
    ).all();
  } else {
    rows = db.prepare(
      `SELECT t.*, c.name AS client_name, u.name AS assigned_name
       FROM tasks t LEFT JOIN clients c ON c.id=t.client_id LEFT JOIN users u ON u.id=t.assigned_to
       WHERE t.kind='operativa' AND COALESCE(t.deleted,0)=0 AND (t.assigned_to=? OR t.created_by=?) ORDER BY t.status, t.due_date`
    ).all(req.user.id, req.user.id);
  }
  res.json({ tasks: rows });
});

// Crear tarea operativa (admin puede asignar a otros).
router.post('/tasks', requireAuth, (req, res) => {
  const { title, client_id, assigned_to, due_date } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Falta el titulo.' });
  const assignee = req.user.role === 'admin' && assigned_to ? assigned_to : req.user.id;
  const info = db.prepare(
    `INSERT INTO tasks (kind,title,client_id,assigned_to,created_by,due_date,status,active)
     VALUES ('operativa',?,?,?,?,?, 'pendiente', 0)`
  ).run(title, client_id || null, assignee, req.user.id, due_date || null);
  if (assignee !== req.user.id) notify(assignee, `Nueva tarea asignada: ${title}`, '#/tareas');
  if (client_id) timeline(client_id, 'tarea', `Tarea: ${title}`, req.user.id, 'task', info.lastInsertRowid);
  audit(req.user.id, 'crear_tarea', 'task', info.lastInsertRowid, title);
  res.json({ id: info.lastInsertRowid });
});

// Cambiar estado de tarea operativa.
router.post('/tasks/:id/status', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'No existe.' });
  const { status, note } = req.body || {};
  if (!['pendiente', 'en_proceso', 'completada'].includes(status)) return res.status(400).json({ error: 'Estado invalido.' });
  const completedAt = status === 'completada' ? new Date().toISOString() : null;
  db.prepare('UPDATE tasks SET status=?, result_note=COALESCE(?,result_note), completed_at=? WHERE id=?')
    .run(status, note || null, completedAt, t.id);
  if (status === 'completada') {
    addScore(t.assigned_to, 'tarea', 'task', t.id);
    if (t.client_id) timeline(t.client_id, 'tarea', `Tarea completada: ${t.title}${note ? ' - ' + note : ''}`, req.user.id, 'task', t.id);
  }
  audit(req.user.id, 'estado_tarea', 'task', t.id, status);
  res.json({ ok: true });
});

// Registrar resultado de una tarea COMERCIAL.
router.post('/tasks/:id/result', requireAuth, (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!t || t.kind !== 'comercial') return res.status(404).json({ error: 'Tarea comercial inexistente.' });
  const { result, reason, note, premium, company, commission } = req.body || {};
  const valid = ['no_contactado', 'no_respondio', 'contactado', 'cotizacion_enviada', 'venta_cerrada', 'no_interesado', 'inviable'];
  if (!valid.includes(result)) return res.status(400).json({ error: 'Resultado invalido.' });

  const setBase = { result, reason: reason || null, result_note: note || null };
  const label = LABELS.result[result];

  if (result === 'no_contactado' || result === 'no_respondio') {
    // Sigue activa: reaparece manana.
    db.prepare('UPDATE tasks SET result=?, result_note=?, status=? WHERE id=?')
      .run(result, note || null, 'pendiente', t.id);
  } else if (result === 'contactado') {
    db.prepare('UPDATE tasks SET result=?, result_note=?, status=? WHERE id=?')
      .run(result, note || null, 'en_proceso', t.id);
    addScore(t.assigned_to, 'contacto', 'task', t.id);
    if (t.client_id) timeline(t.client_id, 'contacto', `Contacto comercial realizado (${t.offer})`, req.user.id, 'task', t.id);
  } else if (result === 'cotizacion_enviada') {
    const fu = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    db.prepare("UPDATE tasks SET result=?, result_note=?, status='en_proceso', active=0, follow_up_date=? WHERE id=?")
      .run(result, note || null, fu, t.id);
    addScore(t.assigned_to, 'cotizacion', 'task', t.id);
    if (t.client_id) timeline(t.client_id, 'cotizacion', `Cotizacion enviada (${t.offer})`, req.user.id, 'task', t.id);
  } else if (result === 'venta_cerrada') {
    // Queda visible hoy (verde). active=1 hasta que la generacion diaria la reemplace manana.
    db.prepare("UPDATE tasks SET result=?, result_note=?, status='completada', active=1, completed_at=datetime('now') WHERE id=?")
      .run(result, note || null, t.id);
    // Genera alta automatica (pendiente de aprobacion del admin).
    const info = db.prepare(
      `INSERT INTO movements (client_id,type,branch,company,premium,commission,note,status,created_by,source_task_id)
       VALUES (?,?,?,?,?,?,?, 'pendiente', ?, ?)`
    ).run(t.client_id, 'alta', t.offer || 'Auto', company || null, premium || 0, commission || 0,
          'Generada por venta cerrada', t.assigned_to, t.id);
    notifyRole('admin', `Alta por venta cerrada pendiente de aprobacion: ${t.offer}`, '#/aprobaciones');
    if (t.client_id) timeline(t.client_id, 'alta', `Venta cerrada: ${t.offer} (alta pendiente de aprobacion)`, req.user.id, 'movement', info.lastInsertRowid);
    addScore(t.assigned_to, 'venta', 'task', t.id);
  } else if (result === 'no_interesado') {
    if (!reason) return res.status(400).json({ error: 'Indique el motivo (precio, ya tiene productor, etc.).' });
    // Queda visible hoy (rojo suave) con +1 punto por el intento; manana se reemplaza.
    db.prepare("UPDATE tasks SET result=?, reason=?, result_note=?, status='completada', active=1, completed_at=datetime('now') WHERE id=?")
      .run(result, reason, note || null, t.id);
    addScore(t.assigned_to, 'intento', 'task', t.id);
    if (t.client_id) timeline(t.client_id, 'contacto', `Oportunidad cerrada (no interesado: ${reason})`, req.user.id, 'task', t.id);
  } else if (result === 'inviable') {
    if (!reason) return res.status(400).json({ error: 'Indique el motivo de inviabilidad.' });
    // Se cierra sin mas: sale de las tareas de hoy, sin puntos ni revision.
    db.prepare("UPDATE tasks SET result=?, reason=?, result_note=?, status='completada', active=0, completed_at=datetime('now') WHERE id=?")
      .run(result, reason, note || null, t.id);
    if (t.client_id) timeline(t.client_id, 'tarea', `Marcado inviable (${reason})`, req.user.id, 'task', t.id);
  }
  audit(req.user.id, 'resultado_comercial', 'task', t.id, `${label}${reason ? ' / ' + reason : ''}`);
  res.json({ ok: true });
});

// Revision de inviables por el admin (+1 aprobado / -5 rechazado).
router.post('/tasks/:id/review', requireAuth, requireRole('admin'), (req, res) => {
  const t = db.prepare('SELECT * FROM tasks WHERE id=?').get(req.params.id);
  if (!t || t.result !== 'inviable') return res.status(400).json({ error: 'No aplicable.' });
  const decision = req.body?.decision;
  if (decision === 'aprobar') {
    addScore(t.assigned_to, 'inviable_aprobado', 'task', t.id);
    db.prepare("UPDATE tasks SET reason=reason||' [aprobado]' WHERE id=?").run(t.id);
    notify(t.assigned_to, 'Tu inviable fue aprobado', '#/tareas');
  } else if (decision === 'rechazar') {
    addScore(t.assigned_to, 'inviable_rechazado', 'task', t.id);
    // Reabre la tarea para reintentar.
    db.prepare("UPDATE tasks SET status='pendiente', active=1, result=NULL, reason=reason||' [rechazado]' WHERE id=?").run(t.id);
    notify(t.assigned_to, 'Tu inviable fue rechazado: reintentar contacto', '#/tareas');
  } else {
    return res.status(400).json({ error: 'Decision invalida.' });
  }
  audit(req.user.id, 'revisar_inviable', 'task', t.id, decision);
  res.json({ ok: true });
});

/* =================== SINIESTROS =================== */
router.get('/claims', requireAuth, (req, res) => {
  const status = req.query.status;
  let sql = `SELECT cl.*, c.name AS client_name, u.name AS created_name, a.name AS assigned_name
             FROM claims cl JOIN clients c ON c.id=cl.client_id
             LEFT JOIN users u ON u.id=cl.created_by LEFT JOIN users a ON a.id=cl.assigned_to WHERE 1=1`;
  const args = [];
  if (status) { sql += ' AND cl.status=?'; args.push(status); }
  sql += ' ORDER BY cl.created_at DESC';
  res.json({ claims: db.prepare(sql).all(...args) });
});

router.get('/claims/:id', requireAuth, (req, res) => {
  const cl = db.prepare(
    `SELECT cl.*, c.name AS client_name, c.phone, c.email, u.name AS created_name, a.name AS assigned_name
     FROM claims cl JOIN clients c ON c.id=cl.client_id
     LEFT JOIN users u ON u.id=cl.created_by LEFT JOIN users a ON a.id=cl.assigned_to WHERE cl.id=?`
  ).get(req.params.id);
  if (!cl) return res.status(404).json({ error: 'No existe.' });
  const events = db.prepare(
    `SELECT e.*, u.name AS user_name FROM claim_events e LEFT JOIN users u ON u.id=e.user_id
     WHERE e.claim_id=? ORDER BY e.created_at`
  ).all(cl.id);
  res.json({ claim: cl, events });
});

// Crear siniestro (cualquier rol). Notifica a Siniestros (Natalia).
router.post('/claims', requireAuth, (req, res) => {
  const { client_id, type, company, incident_date, description } = req.body || {};
  if (!client_id || !type) return res.status(400).json({ error: 'Cliente y tipo son obligatorios.' });
  const client = db.prepare('SELECT * FROM clients WHERE id=?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Cliente inexistente.' });
  // Asigna al primer usuario de siniestros activo.
  const sin = db.prepare("SELECT id FROM users WHERE role='siniestros' AND active=1 ORDER BY id LIMIT 1").get();
  const info = db.prepare(
    `INSERT INTO claims (client_id,type,company,incident_date,description,status,created_by,assigned_to)
     VALUES (?,?,?,?,?, 'abierto', ?, ?)`
  ).run(client_id, type, company || null, incident_date || null, description || null, req.user.id, sin ? sin.id : null);
  const id = info.lastInsertRowid;
  db.prepare(`INSERT INTO claim_events (claim_id,user_id,text,kind) VALUES (?,?,?, 'creacion')`)
    .run(id, req.user.id, `Siniestro creado por ${req.user.name}`);
  timeline(client_id, 'siniestro', `Siniestro ${type} creado`, req.user.id, 'claim', id);
  if (sin) notify(sin.id, `Nuevo siniestro cargado: ${client.name} (${type})`, '#/siniestros/' + id);
  notifyRole('siniestros', `Nuevo siniestro: ${client.name} (${type})`, '#/siniestros/' + id);
  audit(req.user.id, 'crear_siniestro', 'claim', id, `${client.name} - ${type}`);
  res.json({ id });
});

// Cambiar estado del siniestro (siniestros/admin).
router.post('/claims/:id/status', requireAuth, requireRole('siniestros', 'admin'), (req, res) => {
  const cl = db.prepare('SELECT * FROM claims WHERE id=?').get(req.params.id);
  if (!cl) return res.status(404).json({ error: 'No existe.' });
  const status = req.body?.status;
  const valid = ['abierto', 'documentacion_pendiente', 'presentado', 'en_analisis', 'liquidado', 'cerrado'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Estado invalido.' });
  const closedAt = status === 'cerrado' ? new Date().toISOString() : null;
  db.prepare('UPDATE claims SET status=?, closed_at=? WHERE id=?').run(status, closedAt, cl.id);
  db.prepare(`INSERT INTO claim_events (claim_id,user_id,text,kind) VALUES (?,?,?, 'estado')`)
    .run(cl.id, req.user.id, `Estado cambiado a: ${LABELS.claimStatus[status]}`);
  timeline(cl.client_id, 'siniestro', `Siniestro ${status === 'cerrado' ? 'cerrado' : 'actualizado'}: ${LABELS.claimStatus[status]}`, req.user.id, 'claim', cl.id);
  audit(req.user.id, 'estado_siniestro', 'claim', cl.id, status);
  res.json({ ok: true });
});

// Agregar novedad al timeline del siniestro (cualquier rol con acceso).
router.post('/claims/:id/event', requireAuth, (req, res) => {
  const cl = db.prepare('SELECT * FROM claims WHERE id=?').get(req.params.id);
  if (!cl) return res.status(404).json({ error: 'No existe.' });
  const text = (req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Texto vacio.' });
  db.prepare(`INSERT INTO claim_events (claim_id,user_id,text,kind) VALUES (?,?,?, 'nota')`)
    .run(cl.id, req.user.id, text);
  // Avisar al gestor si el autor no es el asignado.
  if (cl.assigned_to && cl.assigned_to !== req.user.id) {
    notify(cl.assigned_to, `Novedad en siniestro #${cl.id}`, '#/siniestros/' + cl.id);
  }
  audit(req.user.id, 'novedad_siniestro', 'claim', cl.id, text.slice(0, 80));
  res.json({ ok: true });
});

/* =================== OBJETIVOS =================== */
router.get('/objectives', requireAuth, (req, res) => {
  res.json({ objectives: db.prepare('SELECT * FROM objectives WHERE COALESCE(deleted,0)=0 ORDER BY active DESC, id DESC').all() });
});

router.post('/objectives', requireAuth, requireRole('admin'), (req, res) => {
  const { name, branch, target, avg_commission, priority, start_date, end_date } = req.body || {};
  if (!name || !start_date || !end_date) return res.status(400).json({ error: 'Faltan datos del objetivo.' });
  const info = db.prepare(
    `INSERT INTO objectives (name,branch,target,avg_commission,priority,start_date,end_date,active)
     VALUES (?,?,?,?,?,?,?,1)`
  ).run(name, branch || null, target || 0, avg_commission || 0, priority || 'media', start_date, end_date);
  audit(req.user.id, 'crear_objetivo', 'objective', info.lastInsertRowid, name);
  res.json({ id: info.lastInsertRowid });
});

/* =================== CAMPANAS =================== */
router.get('/campaigns', requireAuth, (req, res) => {
  const camps = db.prepare('SELECT * FROM campaigns WHERE COALESCE(deleted,0)=0 ORDER BY active DESC, id DESC').all();
  res.json({ campaigns: camps });
});

router.post('/campaigns', requireAuth, requireRole('admin'), (req, res) => {
  const { name, branch, target_product, goal, priority, start_date, end_date } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Falta el nombre.' });
  const info = db.prepare(
    `INSERT INTO campaigns (name,branch,target_product,goal,priority,start_date,end_date,active)
     VALUES (?,?,?,?,?,?,?,1)`
  ).run(name, branch || null, target_product || branch || null, goal || 0, priority || 'media', start_date || null, end_date || null);
  audit(req.user.id, 'crear_campana', 'campaign', info.lastInsertRowid, name);
  res.json({ id: info.lastInsertRowid });
});

/* =================== APROBACIONES =================== */
router.get('/approvals', requireAuth, requireRole('admin'), (req, res) => {
  const movements = db.prepare(
    `SELECT m.*, c.name AS client_name, u.name AS created_name FROM movements m
     JOIN clients c ON c.id=m.client_id LEFT JOIN users u ON u.id=m.created_by
     WHERE m.status='pendiente' ORDER BY m.created_at`
  ).all();
  const clients = db.prepare(
    `SELECT c.*, u.name AS created_name FROM clients c LEFT JOIN users u ON u.id=c.created_by
     WHERE c.status='pendiente' ORDER BY c.created_at`
  ).all();
  // Los inviables ya no requieren revision (se cierran solos). Se conserva el
  // campo por compatibilidad, siempre vacio.
  const inviables = [];
  res.json({ movements, clients, inviables });
});

router.post('/clients/:id/approve', requireAuth, requireRole('admin'), (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe.' });
  db.prepare("UPDATE clients SET status='aprobado' WHERE id=?").run(c.id);
  audit(req.user.id, 'aprobar_cliente', 'client', c.id, c.name);
  res.json({ ok: true });
});

/* =================== SCORE CONFIG =================== */
router.get('/score/config', requireAuth, (req, res) => {
  res.json({ config: db.prepare('SELECT * FROM score_config ORDER BY points DESC').all() });
});

router.put('/score/config', requireAuth, requireRole('admin'), (req, res) => {
  const items = req.body?.items || [];
  const stmt = db.prepare('UPDATE score_config SET points=? WHERE key=?');
  for (const it of items) stmt.run(Number(it.points) || 0, it.key);
  audit(req.user.id, 'editar_score', 'config', null, null);
  res.json({ ok: true });
});

/* =================== AUDITORIA =================== */
router.get('/audit', requireAuth, requireRole('admin'), (req, res) => {
  const rows = db.prepare(
    `SELECT a.*, u.name AS user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
     ORDER BY a.created_at DESC LIMIT 300`
  ).all();
  res.json({ audit: rows });
});

/* =================== NOTIFICACIONES =================== */
router.get('/notifications', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
  const unread = rows.filter((r) => !r.read).length;
  res.json({ notifications: rows, unread });
});

router.post('/notifications/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id);
  res.json({ ok: true });
});

/* =================== SUPERVISION (admin) =================== */
router.get('/admin/supervision', requireAuth, requireRole('admin'), (req, res) => {
  const users = db.prepare(`SELECT id, name, role FROM users WHERE role != 'admin' AND active=1`).all();
  const now = Date.now();
  const result = users.map((u) => {
    const session = db.prepare(
      `SELECT created_at FROM sessions WHERE user_id=? ORDER BY created_at DESC LIMIT 1`
    ).get(u.id);
    const tasks = db.prepare(
      `SELECT t.id, t.title, t.result, t.offer, t.updated_at, t.status,
              c.name AS client_name
       FROM tasks t LEFT JOIN clients c ON c.id=t.client_id
       WHERE t.assigned_to=? AND t.kind='comercial' AND t.active=1 AND COALESCE(t.deleted,0)=0
       ORDER BY t.created_at`
    ).all(u.id);
    const counts = { pendiente: 0, en_progreso: 0, completada: 0 };
    const FINAL = ['venta_cerrada', 'no_interesado', 'inviable'];
    for (const t of tasks) {
      if (FINAL.includes(t.result)) counts.completada++;
      else if (t.result && t.result !== 'no_contactado') counts.en_progreso++;
      else counts.pendiente++;
    }
    const tasksWithAlert = tasks.map((t) => {
      const updMs = t.updated_at ? new Date(t.updated_at).getTime() : 0;
      const diffH = updMs ? (now - updMs) / 3600000 : 9999;
      const active = !FINAL.includes(t.result);
      const atrasada = active && diffH > 24;
      return { ...t, diffH: Math.round(diffH), atrasada };
    });
    return {
      id: u.id, name: u.name, role: u.role,
      ultima_sesion: session?.created_at || null,
      counts, tasks: tasksWithAlert,
    };
  });
  res.json({ users: result });
});

export default router;
