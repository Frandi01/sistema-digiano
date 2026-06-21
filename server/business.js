// Logica de negocio central: oportunidades (cross-sell), tareas comerciales
// diarias (mantener 5 activas) y aplicacion de altas/bajas al perfil del cliente.
import db from './db.js';
import { BRANCHES, addScore, audit, timeline } from './helpers.js';

// Prioridad de productos a ofrecer en cross-sell (Hogar es el foco principal,
// segun la campana "Auto sin Hogar"). ART y Caucion no se ofrecen automaticamente.
const OFFER_PRIORITY = ['Hogar', 'AP', 'Salud', 'Auto', 'Vida', 'Comercio'];

// Devuelve, para un cliente, los ramos que NO tiene vigentes.
export function missingBranches(clientId) {
  const have = db
    .prepare(`SELECT DISTINCT branch FROM policies WHERE client_id = ? AND status = 'vigente'`)
    .all(clientId)
    .map((r) => r.branch);
  return BRANCHES.filter((b) => !have.includes(b));
}

// Oportunidades de cross-sell sobre toda la cartera (clientes con al menos
// un producto vigente, a los que les falta otro).
export function detectOpportunities() {
  const clients = db
    .prepare(`SELECT id, name FROM clients WHERE status = 'aprobado'`)
    .all();
  const ops = [];
  for (const c of clients) {
    const have = db
      .prepare(`SELECT DISTINCT branch FROM policies WHERE client_id = ? AND status='vigente'`)
      .all(c.id)
      .map((r) => r.branch);
    if (have.length === 0) continue; // sin productos: no es cross-sell
    const missing = OFFER_PRIORITY.filter((b) => !have.includes(b));
    if (missing.length) {
      ops.push({ client_id: c.id, client: c.name, has: have, offer: missing[0], missing });
    }
  }
  return ops;
}

// Genera/mantiene 5 tareas comerciales ACTIVAS para un usuario comercial.
// Las tareas no cerradas se arrastran; se completan cupos con nuevas oportunidades.
export function ensureDailyTasks(userId) {
  const SLOTS = 5;
  const today = new Date().toISOString().slice(0, 10);

  // Marcar vencidas las pendientes sin cierre.
  db.prepare(
    `UPDATE tasks SET status='vencida'
     WHERE assigned_to=? AND kind='comercial' AND status='pendiente'
       AND due_date IS NOT NULL AND date(due_date) < date('now')`
  ).run(userId);

  // PRIORIDAD 1: reactivar seguimientos vencidos (cotizacion enviada cuyo
  // dia de seguimiento ya llego) para que vuelvan a aparecer en Tareas de hoy.
  db.prepare(
    `UPDATE tasks SET active=1, status='pendiente'
     WHERE assigned_to=? AND kind='comercial' AND result='cotizacion_enviada'
       AND status!='completada' AND active=0 AND COALESCE(deleted,0)=0
       AND follow_up_date IS NOT NULL AND date(follow_up_date) <= date('now')`
  ).run(userId);

  const activeCount = db
    .prepare(`SELECT COUNT(*) AS n FROM tasks WHERE assigned_to=? AND kind='comercial' AND active=1 AND COALESCE(deleted,0)=0`)
    .get(userId).n;
  let need = SLOTS - activeCount;
  if (need <= 0) return;

  // Clientes que ya tienen una tarea comercial sin completar (evita duplicados).
  const busy = new Set(
    db.prepare(
      `SELECT DISTINCT client_id FROM tasks
       WHERE kind='comercial' AND client_id IS NOT NULL AND status != 'completada' AND COALESCE(deleted,0)=0`
    ).all().map((r) => r.client_id)
  );

  const insertTask = (clientId, clientName, offer, campaignId) => {
    const info = db.prepare(
      `INSERT INTO tasks (kind, title, offer, client_id, assigned_to, created_by, status, due_date, active, campaign_id)
       VALUES ('comercial', ?, ?, ?, ?, ?, 'pendiente', ?, 1, ?)`
    ).run(`Contactar a ${clientName}`, offer, clientId, userId, userId, today, campaignId || null);
    timeline(clientId, 'tarea', `Tarea comercial generada: ofrecer ${offer}`, userId, 'task', info.lastInsertRowid);
    busy.add(clientId);
    need--;
  };

  // PRIORIDAD 2: clientes de objetivos activos (ordenados por prioridad del admin).
  const objectives = db.prepare(
    `SELECT id, name, branch FROM objectives
     WHERE active=1 AND COALESCE(deleted,0)=0 AND branch IS NOT NULL
       AND date('now') BETWEEN date(start_date) AND date(end_date)
     ORDER BY CASE COALESCE(priority,'media') WHEN 'alta' THEN 0 WHEN 'media' THEN 1 ELSE 2 END, end_date`
  ).all();
  for (const obj of objectives) {
    if (need <= 0) break;
    const cands = db.prepare(
      `SELECT c.id, c.name FROM clients c
       WHERE c.status='aprobado'
         AND EXISTS (SELECT 1 FROM policies p WHERE p.client_id=c.id AND p.status='vigente')
         AND NOT EXISTS (SELECT 1 FROM policies p WHERE p.client_id=c.id AND p.status='vigente' AND p.branch=?)
       ORDER BY c.name`
    ).all(obj.branch);
    for (const c of cands) {
      if (need <= 0) break;
      if (busy.has(c.id)) continue;
      insertTask(c.id, c.name, obj.branch, obj.id);
    }
  }

  // PRIORIDAD 3: oportunidades comerciales generales del CRM.
  if (need > 0) {
    const ops = detectOpportunities().filter((o) => !busy.has(o.client_id));
    for (const op of ops) {
      if (need <= 0) break;
      insertTask(op.client_id, op.client, op.offer, null);
    }
  }
}

// Cierra el cupo de una tarea comercial (deja de ocupar slot diario).
function freeSlot(taskId) {
  db.prepare('UPDATE tasks SET active=0 WHERE id=?').run(taskId);
}

// Aplica un movimiento APROBADO sobre el perfil del cliente.
export function applyMovement(mov, actingUserId) {
  if (mov.type === 'alta') {
    // Crea poliza vigente (o reactiva una en baja del mismo ramo/compania).
    const existing = db
      .prepare(
        `SELECT id FROM policies WHERE client_id=? AND branch=? AND status='baja' LIMIT 1`
      )
      .get(mov.client_id, mov.branch);
    if (existing) {
      db.prepare(
        `UPDATE policies SET status='vigente', company=?, policy_number=?, premium=?, start_date=date('now'), end_date=NULL WHERE id=?`
      ).run(mov.company, mov.policy_number, mov.premium, existing.id);
    } else {
      db.prepare(
        `INSERT INTO policies (client_id, branch, company, policy_number, premium, status, start_date)
         VALUES (?,?,?,?,?, 'vigente', date('now'))`
      ).run(mov.client_id, mov.branch, mov.company, mov.policy_number, mov.premium);
    }
    timeline(mov.client_id, 'alta', `Alta ${mov.branch}${mov.company ? ' (' + mov.company + ')' : ''}`, actingUserId, 'movement', mov.id);
  } else if (mov.type === 'baja') {
    db.prepare(
      `UPDATE policies SET status='baja', end_date=date('now')
       WHERE client_id=? AND branch=? AND status='vigente'`
    ).run(mov.client_id, mov.branch);
    timeline(mov.client_id, 'baja', `Baja ${mov.branch}`, actingUserId, 'movement', mov.id);
  }
}

export { freeSlot };
