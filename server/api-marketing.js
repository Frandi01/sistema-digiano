// API de marketing: calendario de contenido y tareas para Juliana.
import express from './micro.js';
import db from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { audit } from './helpers.js';
import { generateMarketingBatches } from './business.js';

const router = express.Router();

const isMarketing = requireRole('admin', 'marketing');

/* =================== CALENDARIO =================== */
router.get('/marketing/calendar/:year/:month', requireAuth, isMarketing, (req, res) => {
  const { year, month } = req.params;
  const prefix = `${year}-${String(month).padStart(2, '0')}`;
  const notes = db.prepare(
    `SELECT n.*, u.name AS created_name FROM marketing_notes n
     LEFT JOIN users u ON u.id = n.created_by
     WHERE n.date LIKE ? ORDER BY n.date`
  ).all(prefix + '%');
  res.json({ notes });
});

router.post('/marketing/calendar', requireAuth, isMarketing, (req, res) => {
  const { date, text } = req.body || {};
  if (!date || !text) return res.status(400).json({ error: 'Faltan date y text.' });
  const info = db.prepare(
    'INSERT INTO marketing_notes (date, text, created_by) VALUES (?,?,?)'
  ).run(date, text.trim(), req.user.id);
  audit(req.user.id, 'marketing_nota', 'marketing_note', info.lastInsertRowid, `${date}: ${text.trim().slice(0, 60)}`);
  res.json({ id: info.lastInsertRowid });
});

router.delete('/marketing/calendar/:id', requireAuth, isMarketing, (req, res) => {
  const note = db.prepare('SELECT * FROM marketing_notes WHERE id=?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'No existe.' });
  if (req.user.role !== 'admin' && note.created_by !== req.user.id)
    return res.status(403).json({ error: 'Sin permisos.' });
  db.prepare('DELETE FROM marketing_notes WHERE id=?').run(note.id);
  res.json({ ok: true });
});

/* =================== TAREAS DE MARKETING =================== */
router.get('/marketing/tasks', requireAuth, isMarketing, (req, res) => {
  try { generateMarketingBatches(); } catch (e) { /* noop */ }
  const tasks = db.prepare(
    `SELECT t.*, u.name AS created_name FROM marketing_tasks t
     LEFT JOIN users u ON u.id = t.created_by
     ORDER BY CASE t.status WHEN 'pendiente' THEN 0 WHEN 'en_progreso' THEN 1 ELSE 2 END, t.due_date`
  ).all();
  res.json({ tasks });
});

router.post('/marketing/tasks', requireAuth, requireRole('admin'), (req, res) => {
  const { type, description, due_date } = req.body || {};
  if (!type) return res.status(400).json({ error: 'Falta el tipo de tarea.' });
  const info = db.prepare(
    `INSERT INTO marketing_tasks (type, description, due_date, created_by) VALUES (?,?,?,?)`
  ).run(type, description || null, due_date || null, req.user.id);
  audit(req.user.id, 'marketing_tarea', 'marketing_task', info.lastInsertRowid, type);
  // Notificar a Juliana
  const juliana = db.prepare("SELECT id FROM users WHERE role='marketing' AND active=1 LIMIT 1").get();
  if (juliana) {
    db.prepare('INSERT INTO notifications (user_id, text, link) VALUES (?,?,?)')
      .run(juliana.id, `Nueva tarea de marketing: ${type}`, '#/marketing');
  }
  res.json({ id: info.lastInsertRowid });
});

router.put('/marketing/tasks/:id', requireAuth, isMarketing, (req, res) => {
  const t = db.prepare('SELECT * FROM marketing_tasks WHERE id=?').get(req.params.id);
  if (!t) return res.status(404).json({ error: 'No existe.' });
  const { status, result_notes } = req.body || {};
  if (status && !['pendiente', 'en_progreso', 'completado'].includes(status))
    return res.status(400).json({ error: 'Estado invalido.' });
  const completedAt = status === 'completado' ? new Date().toISOString() : t.completed_at;
  db.prepare(
    `UPDATE marketing_tasks SET status=COALESCE(?,status), result_notes=COALESCE(?,result_notes), completed_at=? WHERE id=?`
  ).run(status || null, result_notes || null, completedAt, t.id);
  audit(req.user.id, 'marketing_tarea_update', 'marketing_task', t.id, status || 'edicion');
  res.json({ ok: true });
});

/* =================== PIPELINE DE CONTENIDO =================== */
const CONTENT_STATES = ['idea', 'guion', 'pend_grabar', 'grabado', 'editando', 'revision', 'programado', 'publicado', 'pendiente_metricas'];

router.get('/marketing/content', requireAuth, isMarketing, (req, res) => {
  const items = db.prepare(
    `SELECT c.*, o.name AS campaign_name FROM mkt_content c
     LEFT JOIN objectives o ON o.id = c.campaign_id
     WHERE c.archived = 0 ORDER BY c.updated_at DESC, c.id DESC`
  ).all();
  res.json({ items });
});

router.post('/marketing/content', requireAuth, isMarketing, (req, res) => {
  const { title, description, format, status, campaign_id } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Falta el titulo.' });
  const st = CONTENT_STATES.includes(status) ? status : 'idea';
  const info = db.prepare(
    `INSERT INTO mkt_content (title,description,format,status,campaign_id,created_by,updated_at)
     VALUES (?,?,?,?,?,?, datetime('now'))`
  ).run(title, description || null, format || null, st, campaign_id || null, req.user.id);
  audit(req.user.id, 'mkt_contenido', 'mkt_content', info.lastInsertRowid, title);
  res.json({ id: info.lastInsertRowid });
});

router.put('/marketing/content/:id', requireAuth, isMarketing, (req, res) => {
  const c = db.prepare('SELECT * FROM mkt_content WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe.' });
  const b = req.body || {};
  if (b.status && !CONTENT_STATES.includes(b.status)) return res.status(400).json({ error: 'Estado invalido.' });
  db.prepare(
    `UPDATE mkt_content SET title=COALESCE(?,title), description=COALESCE(?,description),
       format=COALESCE(?,format), status=COALESCE(?,status), campaign_id=?, updated_at=datetime('now') WHERE id=?`
  ).run(b.title ?? null, b.description ?? null, b.format ?? null, b.status ?? null,
    b.campaign_id === undefined ? c.campaign_id : (b.campaign_id || null), c.id);
  res.json({ ok: true });
});

router.delete('/marketing/content/:id', requireAuth, isMarketing, (req, res) => {
  db.prepare('UPDATE mkt_content SET archived=1 WHERE id=?').run(req.params.id);
  audit(req.user.id, 'mkt_contenido_archivar', 'mkt_content', Number(req.params.id), null);
  res.json({ ok: true });
});

/* =================== BANCO DE IDEAS =================== */
router.get('/marketing/ideas', requireAuth, isMarketing, (req, res) => {
  const ideas = db.prepare(
    `SELECT i.*, u.name AS author FROM mkt_ideas i LEFT JOIN users u ON u.id=i.created_by
     WHERE i.archived = 0 ORDER BY CASE i.priority WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, i.created_at DESC`
  ).all();
  res.json({ ideas });
});

router.post('/marketing/ideas', requireAuth, isMarketing, (req, res) => {
  const { title, description, objective, priority, tags } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Falta el titulo.' });
  const info = db.prepare(
    `INSERT INTO mkt_ideas (title,description,objective,priority,tags,created_by) VALUES (?,?,?,?,?,?)`
  ).run(title, description || null, objective || null, ['alta', 'media', 'baja'].includes(priority) ? priority : 'media', tags || null, req.user.id);
  audit(req.user.id, 'mkt_idea', 'mkt_idea', info.lastInsertRowid, title);
  res.json({ id: info.lastInsertRowid });
});

router.put('/marketing/ideas/:id', requireAuth, isMarketing, (req, res) => {
  const i = db.prepare('SELECT * FROM mkt_ideas WHERE id=?').get(req.params.id);
  if (!i) return res.status(404).json({ error: 'No existe.' });
  const b = req.body || {};
  db.prepare('UPDATE mkt_ideas SET title=COALESCE(?,title), description=COALESCE(?,description), objective=COALESCE(?,objective), priority=COALESCE(?,priority), tags=COALESCE(?,tags) WHERE id=?')
    .run(b.title ?? null, b.description ?? null, b.objective ?? null, b.priority ?? null, b.tags ?? null, i.id);
  res.json({ ok: true });
});

router.delete('/marketing/ideas/:id', requireAuth, isMarketing, (req, res) => {
  db.prepare('UPDATE mkt_ideas SET archived=1 WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// Convertir una idea en un contenido dentro del Pipeline (estado "idea").
router.post('/marketing/ideas/:id/convert', requireAuth, isMarketing, (req, res) => {
  const i = db.prepare('SELECT * FROM mkt_ideas WHERE id=?').get(req.params.id);
  if (!i) return res.status(404).json({ error: 'No existe.' });
  const info = db.prepare(
    `INSERT INTO mkt_content (title,description,status,created_by,updated_at)
     VALUES (?,?, 'idea', ?, datetime('now'))`
  ).run(i.title, i.objective ? `${i.description || ''}\nObjetivo: ${i.objective}`.trim() : (i.description || null), req.user.id);
  db.prepare('UPDATE mkt_ideas SET archived=1 WHERE id=?').run(i.id);  // pasa al pipeline
  audit(req.user.id, 'mkt_idea_convertir', 'mkt_content', info.lastInsertRowid, i.title);
  res.json({ id: info.lastInsertRowid });
});

/* =================== CIERRE INTELIGENTE DE PUBLICACIONES =================== */
router.post('/marketing/content/:id/close', requireAuth, isMarketing, (req, res) => {
  const c = db.prepare('SELECT * FROM mkt_content WHERE id=?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'No existe.' });
  const b = req.body || {};
  const num = (v) => (v === '' || v === undefined || v === null ? null : Number(v));
  const views = num(b.views), reach = num(b.reach), likes = num(b.likes), comments = num(b.comments);
  const hasMetrics = [views, reach, likes, comments].some((x) => x !== null && !Number.isNaN(x));
  if (!hasMetrics) {
    db.prepare("UPDATE mkt_content SET status='pendiente_metricas', pending_metrics=1, published_at=COALESCE(published_at, datetime('now')), updated_at=datetime('now') WHERE id=?").run(c.id);
    const due = new Date(Date.now() + 48 * 3600 * 1000).toISOString().slice(0, 10);
    db.prepare("INSERT INTO marketing_tasks (type,description,due_date,status,created_by,campaign_id) VALUES ('Cargar metricas',?,?, 'pendiente', ?, ?)")
      .run(`Cargar metricas de: ${c.title}`, due, req.user.id, c.campaign_id || null);
    const juli = db.prepare("SELECT id FROM users WHERE role='marketing' AND active=1 LIMIT 1").get();
    if (juli) db.prepare('INSERT INTO notifications (user_id, text, link) VALUES (?,?,?)').run(juli.id, `Recorda cargar las metricas de "${c.title}" (en 48h)`, '#/marketing');
    audit(req.user.id, 'mkt_cierre_sin_metricas', 'mkt_content', c.id, c.title);
    return res.json({ ok: true, pending: true, message: 'Publicacion cerrada sin metricas. Se creo una tarea para cargarlas en 48h.' });
  }
  db.prepare(
    `UPDATE mkt_content SET status='publicado', pending_metrics=0,
       metrics_views=?, metrics_reach=?, metrics_likes=?, metrics_comments=?,
       published_at=COALESCE(published_at, datetime('now')), updated_at=datetime('now') WHERE id=?`
  ).run(views ?? 0, reach ?? 0, likes ?? 0, comments ?? 0, c.id);
  db.prepare("UPDATE marketing_tasks SET status='completado', completed_at=datetime('now') WHERE type='Cargar metricas' AND status!='completado' AND description LIKE ?").run('%' + c.title + '%');
  audit(req.user.id, 'mkt_cierre_publicacion', 'mkt_content', c.id, c.title);
  res.json({ ok: true, pending: false });
});

/* =================== DASHBOARD DE MARKETING =================== */
router.get('/marketing/dashboard', requireAuth, isMarketing, (req, res) => {
  const byStatus = db.prepare('SELECT status, COUNT(*) n FROM mkt_content WHERE archived=0 GROUP BY status').all();
  const totals = db.prepare(
    `SELECT COUNT(*) total,
       SUM(CASE WHEN status='publicado' THEN 1 ELSE 0 END) publicados,
       SUM(CASE WHEN status='pendiente_metricas' THEN 1 ELSE 0 END) pendientes_metricas,
       COALESCE(SUM(metrics_views),0) views, COALESCE(SUM(metrics_reach),0) reach,
       COALESCE(SUM(metrics_likes),0) likes, COALESCE(SUM(metrics_comments),0) comments
     FROM mkt_content WHERE archived=0`
  ).get();
  const tasks = db.prepare("SELECT SUM(CASE WHEN status='completado' THEN 1 ELSE 0 END) completadas, COUNT(*) total FROM marketing_tasks").get();
  const byCampaign = db.prepare(
    `SELECT o.id, o.name, COUNT(c.id) contenidos,
       SUM(CASE WHEN c.status='publicado' THEN 1 ELSE 0 END) publicados,
       COALESCE(SUM(c.metrics_views),0) views
     FROM objectives o JOIN mkt_content c ON c.campaign_id=o.id AND c.archived=0
     GROUP BY o.id ORDER BY contenidos DESC LIMIT 10`
  ).all();
  const recientes = db.prepare(
    `SELECT c.title, c.status, c.published_at, c.metrics_views, o.name AS campaign_name
     FROM mkt_content c LEFT JOIN objectives o ON o.id=c.campaign_id
     WHERE c.status='publicado' ORDER BY c.published_at DESC LIMIT 8`
  ).all();
  res.json({ byStatus, totals, tasks, byCampaign, recientes });
});

/* =================== BIBLIOTECA DE MARCA (enlaces) =================== */
router.get('/marketing/brand', requireAuth, isMarketing, (req, res) => {
  res.json({ links: db.prepare('SELECT b.*, u.name AS author FROM mkt_brand b LEFT JOIN users u ON u.id=b.created_by ORDER BY b.category, b.id DESC').all() });
});
router.post('/marketing/brand', requireAuth, isMarketing, (req, res) => {
  const { title, url, category } = req.body || {};
  if (!title || !url) return res.status(400).json({ error: 'Faltan titulo y enlace.' });
  const info = db.prepare('INSERT INTO mkt_brand (title,url,category,created_by) VALUES (?,?,?,?)').run(title, url, category || 'General', req.user.id);
  audit(req.user.id, 'mkt_brand_link', 'mkt_brand', info.lastInsertRowid, title);
  res.json({ id: info.lastInsertRowid });
});
router.delete('/marketing/brand/:id', requireAuth, isMarketing, (req, res) => {
  db.prepare('DELETE FROM mkt_brand WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
