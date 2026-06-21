// Helpers compartidos: auditoria, score, notificaciones, timeline del cliente.
import db from './db.js';

export const BRANCHES = ['Auto', 'Hogar', 'Vida', 'Salud', 'AP', 'Comercio', 'Caucion', 'ART'];

// Puntaje por defecto (configurable en tabla score_config).
export const DEFAULT_SCORE = [
  ['contacto', 2, 'Contacto realizado'],
  ['interesado', 5, 'Cliente interesado'],
  ['cotizacion', 8, 'Cotizacion enviada'],
  ['venta', 25, 'Venta cerrada / alta lograda'],
  ['baja_recuperada', 30, 'Baja recuperada'],
  ['tarea', 1, 'Tarea completada'],
  ['intento', 1, 'Intento de contacto'],
  ['inviable_aprobado', 1, 'Inviable aprobado'],
  ['inviable_rechazado', -5, 'Inviable rechazado'],
];

export function scorePoints(key) {
  const row = db.prepare('SELECT points FROM score_config WHERE key = ?').get(key);
  return row ? row.points : 0;
}

export function addScore(userId, key, refType, refId) {
  if (!userId) return;
  const cfg = db.prepare('SELECT points, label FROM score_config WHERE key = ?').get(key);
  if (!cfg) return;
  db.prepare(
    `INSERT INTO score_events (user_id, points, reason, ref_type, ref_id)
     VALUES (?,?,?,?,?)`
  ).run(userId, cfg.points, cfg.label, refType || null, refId || null);
}

export function audit(userId, action, entityType, entityId, detail) {
  db.prepare(
    `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
     VALUES (?,?,?,?,?)`
  ).run(userId || null, action, entityType || null, entityId || null, detail || null);
}

export function timeline(clientId, type, text, userId, refType, refId) {
  if (!clientId) return;
  db.prepare(
    `INSERT INTO client_timeline (client_id, type, text, user_id, ref_type, ref_id)
     VALUES (?,?,?,?,?,?)`
  ).run(clientId, type, text, userId || null, refType || null, refId || null);
}

export function notify(userId, text, link) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications (user_id, text, link) VALUES (?,?,?)')
    .run(userId, text, link || null);
}

// Notifica a todos los usuarios activos de un rol.
export function notifyRole(role, text, link) {
  const users = db.prepare('SELECT id FROM users WHERE role = ? AND active = 1').all(role);
  for (const u of users) notify(u.id, text, link);
}

// Score total de un usuario en el mes actual.
export function monthScore(userId) {
  const row = db.prepare(
    `SELECT COALESCE(SUM(points),0) AS s FROM score_events
     WHERE user_id = ? AND strftime('%Y-%m', created_at) = strftime('%Y-%m','now')`
  ).get(userId);
  return row.s;
}

// Etiquetas de display para estados.
export const LABELS = {
  result: {
    no_contactado: 'No contactado',
    no_respondio: 'No respondio',
    contactado: 'Contactado',
    cotizacion_enviada: 'Cotizacion enviada',
    venta_cerrada: 'Venta cerrada',
    no_interesado: 'No interesado',
    inviable: 'Cerrado por inviable',
  },
  claimStatus: {
    abierto: 'Abierto',
    documentacion_pendiente: 'Documentacion pendiente',
    presentado: 'Presentado en compania',
    en_analisis: 'En analisis',
    liquidado: 'Liquidado',
    cerrado: 'Cerrado',
  },
};
