// API de marketing: calendario de contenido y tareas para Juliana.
import express from './micro.js';
import db from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { audit } from './helpers.js';

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

export default router;
