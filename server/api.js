// API REST del sistema. Todas las rutas cuelgan de /api y requieren sesion
// (excepto login). Roles: admin, comercial, siniestros.
import express from './micro.js';
import db from './db.js';
import {
  login, logout, requireAuth, requireRole, changePassword, publicUser,
  hashPassword, validatePasswordStrength,
} from './auth.js';
import {
  BRANCHES, addScore, audit, timeline, notify, notifyRole, monthScore, LABELS,
} from './helpers.js';
import {
  detectOpportunities, ensureDailyTasks, applyMovement, missingBranches, freeSlot,
} from './business.js';
import { createChangeRequest } from './api3.js';

const router = express.Router();

/* =================== AUTENTICACION =================== */
router.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const out = login(username, password, req.ip);
  if (out.error) return res.status(401).json({ error: out.error });
  res.cookie('sid', out.token, { httpOnly: true, sameSite: 'lax', maxAge: 12 * 3600 * 1000 });
  res.json({ user: out.user });
});

router.post('/auth/logout', (req, res) => {
  logout(req.cookies?.sid);
  res.clearCookie('sid');
  res.json({ ok: true });
});

router.get('/auth/me', requireAuth, (req, res) => {
  res.json({ user: publicUser(req.user) });
});

router.post('/auth/change-password', requireAuth, (req, res) => {
  const { current, next, force } = req.body || {};
  const err = changePassword(req.user, current, next, !!force && !!req.user.must_change_password);
  if (err) return res.status(400).json({ error: err });
  res.json({ ok: true });
});

/* =================== USUARIOS (admin) =================== */
router.get('/users', requireAuth, requireRole('admin'), (req, res) => {
  const users = db.prepare('SELECT id,name,username,email,role,active,must_change_password,last_login,created_at FROM users ORDER BY active DESC, name').all();
  res.json({ users });
});

router.post('/users', requireAuth, requireRole('admin'), (req, res) => {
  const { name, username, email, role, password } = req.body || {};
  if (!name || !username || !role) return res.status(400).json({ error: 'Nombre, usuario y rol son obligatorios.' });
  if (!['admin', 'comercial', 'siniestros'].includes(role)) return res.status(400).json({ error: 'Rol invalido.' });
  const pw = password || 'Digiano2026';
  const strErr = validatePasswordStrength(pw);
  if (strErr) return res.status(400).json({ error: strErr });
  try {
    const info = db.prepare(
      `INSERT INTO users (name,username,email,password_hash,role,active,must_change_password)
       VALUES (?,?,?,?,?,1,1)`
    ).run(name, username.toLowerCase().trim(), email ? email.toLowerCase().trim() : null, hashPassword(pw), role);
    audit(req.user.id, 'crear_usuario', 'user', info.lastInsertRowid, `${name} (${role})`);
    res.json({ id: info.lastInsertRowid, tempPassword: pw });
  } catch (e) {
    res.status(400).json({ error: 'El nombre de usuario ya existe.' });
  }
});

router.put('/users/:id', requireAuth, requireRole('admin'), (req, res) => {
  const { name, role, active } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'No existe.' });
  db.prepare('UPDATE users SET name=COALESCE(?,name), role=COALESCE(?,role), active=COALESCE(?,active) WHERE id=?')
    .run(name ?? null, role ?? null, active === undefined ? null : (active ? 1 : 0), u.id);
  audit(req.user.id, 'editar_usuario', 'user', u.id, `active=${active}`);
  res.json({ ok: true });
});

router.post('/score/reset', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM score_events').run();
  res.json({ ok: true });
});

router.post('/score/reset-user/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM score_events WHERE user_id=?').run(req.params.id);
  res.json({ ok: true });
});

router.post('/users/:id/reset-password', requireAuth, requireRole('admin'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!u) return res.status(404).json({ error: 'No existe.' });
  const pw = req.body?.password || 'Digiano2026';
  db.prepare('UPDATE users SET password_hash=?, must_change_password=1, failed_attempts=0, locked_until=NULL WHERE id=?')
    .run(hashPassword(pw), u.id);
  audit(req.user.id, 'reset_password', 'user', u.id, null);
  res.json({ ok: true, tempPassword: pw });
});

/* =================== DASHBOARD =================== */
router.get('/dashboard', requireAuth, (req, res) => {
  // Objetivo activo
  const obj = db.prepare(`SELECT * FROM objectives WHERE active=1 AND COALESCE(deleted,0)=0 ORDER BY CASE COALESCE(priority,'media') WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, id DESC LIMIT 1`).get();
  let objective = null;
  if (obj) {
    const branchFilter = obj.branch ? 'AND branch=?' : '';
    const args = obj.branch ? [obj.branch] : [];
    const altas = db.prepare(
      `SELECT COUNT(*) n, COALESCE(SUM(commission),0) com FROM movements
       WHERE type='alta' AND status='aprobado' ${branchFilter}
         AND date(created_at) BETWEEN date(?) AND date(?)`
    ).get(...args, obj.start_date, obj.end_date);
    const totalDays = Math.max(1, daysBetween(obj.start_date, obj.end_date));
    const elapsed = Math.max(0, daysBetween(obj.start_date, today()));
    const daysLeft = Math.max(0, daysBetween(today(), obj.end_date));
    const progress = obj.target > 0 ? Math.min(100, Math.round((altas.n / obj.target) * 100)) : 0;
    const pace = elapsed > 0 ? altas.n / elapsed : 0;
    const projected = Math.round(pace * totalDays);
    objective = {
      ...obj,
      done: altas.n,
      remaining: Math.max(0, obj.target - altas.n),
      progress,
      daysLeft,
      commissionMonth: altas.com,
      commissionProjected: Math.round(projected * (obj.avg_commission || 0)),
    };
  }

  // Movimiento del mes
  const mAltas = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(commission),0) com FROM movements WHERE type='alta' AND status='aprobado' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`).get();
  const mBajas = db.prepare(`SELECT COUNT(*) n FROM movements WHERE type='baja' AND status='aprobado' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`).get();
  const topBranch = db.prepare(`SELECT branch, COUNT(*) n FROM movements WHERE type='alta' AND status='aprobado' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now') GROUP BY branch ORDER BY n DESC LIMIT 1`).get();
  // Mes anterior (para variaciones de los KPI)
  const pAltas = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(commission),0) com FROM movements WHERE type='alta' AND status='aprobado' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now','-1 month')`).get();
  const pBajas = db.prepare(`SELECT COUNT(*) n FROM movements WHERE type='baja' AND status='aprobado' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now','-1 month')`).get();
  const movement = {
    altas: mAltas.n, bajas: mBajas.n, net: mAltas.n - mBajas.n,
    commission: mAltas.com, topBranch: topBranch ? topBranch.branch : null,
    prev: { altas: pAltas.n, bajas: pBajas.n, commission: pAltas.com },
  };

  // Tablero de posiciones (todos los usuarios activos)
  const users = db.prepare(`SELECT id,name,role FROM users WHERE active=1`).all();
  const ranking = users.map((u) => {
    const assigned = db.prepare(`SELECT COUNT(*) n FROM tasks WHERE assigned_to=? AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`).get(u.id).n;
    const completed = db.prepare(`SELECT COUNT(*) n FROM tasks WHERE assigned_to=? AND status='completada' AND strftime('%Y-%m',created_at)=strftime('%Y-%m','now')`).get(u.id).n;
    return {
      id: u.id, name: u.name, role: u.role,
      score: monthScore(u.id), assigned, completed,
      progress: assigned > 0 ? Math.round((completed / assigned) * 100) : 0,
    };
  }).sort((a, b) => b.score - a.score);
  ranking.forEach((r, i) => (r.position = i + 1));

  // KPIs rapidos del equipo
  const pendingTasks = db.prepare(
    "SELECT COUNT(*) n FROM tasks WHERE status IN ('pendiente','en_proceso') AND COALESCE(deleted,0)=0"
  ).get().n;
  const openClaims = db.prepare("SELECT COUNT(*) n FROM claims WHERE status != 'cerrado'").get().n;
  const activeObjectives = db.prepare("SELECT COUNT(*) n FROM objectives WHERE active=1 AND COALESCE(deleted,0)=0").get().n;

  res.json({ objective, movement, ranking, kpis: { pendingTasks, openClaims }, activeObjectives });
});

/* =================== CLIENTES =================== */
router.get('/clients', requireAuth, (req, res) => {
  const q = (req.query.q || '').trim();
  const tag = (req.query.tag || '').trim();
  let sql = `SELECT c.*, (SELECT COUNT(*) FROM policies p WHERE p.client_id=c.id AND p.status='vigente') AS products
             FROM clients c WHERE 1=1`;
  const args = [];
  if (q) { sql += ` AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)`; args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (tag) { sql += ` AND c.tags LIKE ?`; args.push(`%${tag}%`); }
  sql += ` ORDER BY c.name LIMIT 300`;
  const clients = db.prepare(sql).all(...args);
  res.json({ clients });
});

router.get('/clients/:id', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe.' });
  const policies = db.prepare('SELECT * FROM policies WHERE client_id=? ORDER BY status, branch').all(c.id);
  const movements = db.prepare('SELECT * FROM movements WHERE client_id=? ORDER BY created_at DESC').all(c.id);
  const claims = db.prepare('SELECT * FROM claims WHERE client_id=? ORDER BY created_at DESC').all(c.id);
  const tl = db.prepare(`SELECT t.*, u.name AS user_name FROM client_timeline t LEFT JOIN users u ON u.id=t.user_id WHERE t.client_id=? ORDER BY t.created_at DESC LIMIT 100`).all(c.id);
  res.json({
    client: c, policies, movements, claims, timeline: tl,
    missing: missingBranches(c.id),
  });
});

router.post('/clients', requireAuth, (req, res) => {
  const { name, phone, email, observations, tags } = req.body || {};
  if (!name) return res.status(400).json({ error: 'El nombre es obligatorio.' });
  // Un comercial crea cliente como pendiente de aprobacion; admin lo aprueba directo.
  const status = req.user.role === 'admin' ? 'aprobado' : 'pendiente';
  const info = db.prepare(
    `INSERT INTO clients (name,phone,email,observations,tags,status,created_by)
     VALUES (?,?,?,?,?,?,?)`
  ).run(name, phone || null, email || null, observations || null, tags || null, status, req.user.id);
  timeline(info.lastInsertRowid, 'observacion', 'Cliente creado', req.user.id, 'client', info.lastInsertRowid);
  audit(req.user.id, 'crear_cliente', 'client', info.lastInsertRowid, name);
  res.json({ id: info.lastInsertRowid, status });
});

router.put('/clients/:id', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe.' });
  const { name, phone, email, observations, tags } = req.body || {};
  // Cambios sensibles de un no-admin van a aprobacion (no se aplican directo).
  if (req.user.role !== 'admin') {
    createChangeRequest({
      type: 'cliente_editar', entityType: 'client', entityId: c.id, clientId: c.id,
      payload: { name, phone, email, observations, tags },
      summary: `Editar cliente ${c.name}`, userId: req.user.id,
    });
    return res.json({ ok: true, pending: true });
  }
  db.prepare('UPDATE clients SET name=COALESCE(?,name), phone=?, email=?, observations=?, tags=? WHERE id=?')
    .run(name ?? c.name, phone ?? null, email ?? null, observations ?? null, tags ?? null, c.id);
  audit(req.user.id, 'editar_cliente', 'client', c.id, null);
  res.json({ ok: true });
});

router.post('/clients/:id/observation', requireAuth, (req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe.' });
  const text = (req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Texto vacio.' });
  timeline(c.id, 'observacion', text, req.user.id, 'client', c.id);
  audit(req.user.id, 'observacion', 'client', c.id, text.slice(0, 80));
  res.json({ ok: true });
});

/* =================== MOVIMIENTOS (altas/bajas) =================== */
router.get('/movements', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT m.*, c.name AS client_name, u.name AS created_name
     FROM movements m JOIN clients c ON c.id=m.client_id
     LEFT JOIN users u ON u.id=m.created_by
     ORDER BY m.created_at DESC LIMIT 200`
  ).all();
  res.json({ movements: rows });
});

router.post('/movements', requireAuth, (req, res) => {
  const { client_id, type, branch, company, policy_number, premium, commission, note } = req.body || {};
  if (!client_id || !type || !branch) return res.status(400).json({ error: 'Faltan datos del movimiento.' });
  if (!['alta', 'baja'].includes(type)) return res.status(400).json({ error: 'Tipo invalido.' });
  const client = db.prepare('SELECT * FROM clients WHERE id=?').get(client_id);
  if (!client) return res.status(404).json({ error: 'Cliente inexistente.' });

  // Una sola carga: admin aprueba directo, comercial queda pendiente.
  const status = req.user.role === 'admin' ? 'aprobado' : 'pendiente';
  const info = db.prepare(
    `INSERT INTO movements (client_id,type,branch,company,policy_number,premium,commission,note,status,created_by,approved_by,resolved_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(client_id, type, branch, company || null, policy_number || null, premium || 0, commission || 0, note || null,
        status, req.user.id, status === 'aprobado' ? req.user.id : null, status === 'aprobado' ? new Date().toISOString() : null);
  const movId = info.lastInsertRowid;

  if (status === 'aprobado') {
    const mov = db.prepare('SELECT * FROM movements WHERE id=?').get(movId);
    applyMovement(mov, req.user.id);
    if (type === 'alta') addScore(req.user.id, 'venta', 'movement', movId);
    if (type === 'baja') {/* baja recuperada se puntua aparte si aplica */}
  } else {
    notifyRole('admin', `Nueva ${type} pendiente de aprobacion: ${client.name} (${branch})`, '#/aprobaciones');
  }
  audit(req.user.id, `movimiento_${type}`, 'movement', movId, `${client.name} - ${branch} [${status}]`);
  res.json({ id: movId, status });
});

router.post('/movements/:id/approve', requireAuth, requireRole('admin'), (req, res) => {
  const mov = db.prepare('SELECT * FROM movements WHERE id=?').get(req.params.id);
  if (!mov || mov.status !== 'pendiente') return res.status(400).json({ error: 'Movimiento no aprobable.' });
  db.prepare(`UPDATE movements SET status='aprobado', approved_by=?, resolved_at=datetime('now') WHERE id=?`).run(req.user.id, mov.id);
  const fresh = db.prepare('SELECT * FROM movements WHERE id=?').get(mov.id);
  applyMovement(fresh, req.user.id);
  if (mov.type === 'alta') addScore(mov.created_by, 'venta', 'movement', mov.id);
  notify(mov.created_by, `Tu ${mov.type} fue aprobada`, '#/clientes/' + mov.client_id);
  audit(req.user.id, 'aprobar_movimiento', 'movement', mov.id, null);
  res.json({ ok: true });
});

router.post('/movements/:id/reject', requireAuth, requireRole('admin'), (req, res) => {
  const mov = db.prepare('SELECT * FROM movements WHERE id=?').get(req.params.id);
  if (!mov || mov.status !== 'pendiente') return res.status(400).json({ error: 'No aplicable.' });
  db.prepare(`UPDATE movements SET status='rechazado', approved_by=?, resolved_at=datetime('now'), note=? WHERE id=?`)
    .run(req.user.id, (mov.note || '') + ' [Rechazado: ' + (req.body?.reason || '') + ']', mov.id);
  notify(mov.created_by, `Tu ${mov.type} fue rechazada`, '#/clientes/' + mov.client_id);
  audit(req.user.id, 'rechazar_movimiento', 'movement', mov.id, req.body?.reason || null);
  res.json({ ok: true });
});

/* =================== CRM / OPORTUNIDADES =================== */
router.get('/opportunities', requireAuth, (req, res) => {
  res.json({ opportunities: detectOpportunities() });
});

/* =================== METADATOS =================== */
router.get('/meta', requireAuth, (req, res) => {
  res.json({ branches: BRANCHES, labels: LABELS });
});

export default router;

/* ---- utilidades de fecha ---- */
function today() { return new Date().toISOString().slice(0, 10); }
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
