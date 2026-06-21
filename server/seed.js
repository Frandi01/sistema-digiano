// Carga inicial. Idempotente: solo siembra si la base esta vacia.
// Los clientes se cargan desde la cartera real (server/clientes.json).
import db from './db.js';
import { hashPassword } from './auth.js';
import { DEFAULT_SCORE } from './helpers.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadCartera() {
  try {
    const p = path.join(__dirname, 'clientes.json');
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    console.log('  (no se encontro clientes.json; se omite la carga de cartera)');
    return [];
  }
}

// Inserta la cartera real de clientes + sus polizas. Idempotente por nombre.
export function importClients(createdBy) {
  const cartera = loadCartera();
  const insClient = db.prepare(
    `INSERT INTO clients (name,phone,email,observations,tags,status,created_by)
     VALUES (?,?,?,?,?, 'aprobado', ?)`
  );
  const insPolicy = db.prepare(
    `INSERT INTO policies (client_id,branch,company,premium,status,start_date)
     VALUES (?,?,?,0,'vigente', date('now'))`
  );
  const insTl = db.prepare(`INSERT INTO client_timeline (client_id,type,text,user_id) VALUES (?,?,?,?)`);
  const exists = db.prepare('SELECT id FROM clients WHERE name = ?');
  let added = 0;
  db.exec('BEGIN');
  try {
    for (const c of cartera) {
      if (exists.get(c.name)) continue; // ya existe
      const tags = c.tipo === 'juridica' ? 'empresa' : '';
      const obs = c.coberturas ? 'Coberturas: ' + c.coberturas : null;
      const cid = insClient.run(c.name, c.phone || null, c.email || null, obs, tags, createdBy).lastInsertRowid;
      for (const b of c.branches) insPolicy.run(cid, b);
      insTl.run(cid, 'observacion', `Cliente importado de la cartera (${c.branches.join(', ') || 'sin ramos'})`, createdBy);
      added++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return added;
}

export function ensureSeed() {
  // Config de score (siempre asegura claves).
  const scoreStmt = db.prepare('INSERT OR IGNORE INTO score_config (key,points,label) VALUES (?,?,?)');
  for (const [key, points, label] of DEFAULT_SCORE) scoreStmt.run(key, points, label);

  // Migración idempotente: crear usuario Juliana si no existe.
  const juliana = db.prepare("SELECT id FROM users WHERE username='juliana'").get();
  if (!juliana) {
    try {
      db.prepare(
        `INSERT INTO users (name,username,email,password_hash,role,active,must_change_password) VALUES (?,?,?,?,?,1,1)`
      ).run('Juliana', 'juliana', 'juliana@digiano.com', hashPassword('Digiano2026'), 'marketing');
      console.log('  Usuario Juliana (marketing) creado.');
    } catch (e) { console.warn('  No se pudo crear usuario Juliana:', e.message); }
  }

  const count = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  // Considerar "ya sembrado" si hay más usuarios que los que acabamos de migrar
  const hasOtherUsers = db.prepare("SELECT COUNT(*) n FROM users WHERE username != 'juliana'").get().n;
  if (hasOtherUsers > 0) return; // ya sembrado

  console.log('Sembrando datos iniciales...');

  // ---- Usuarios ---- (login por nombre de usuario)
  const insUser = db.prepare(
    `INSERT INTO users (name,username,email,password_hash,role,active,must_change_password) VALUES (?,?,?,?,?,1,?)`
  );
  const adminId = insUser.run('Franco Digiano', 'admin', 'admin@digiano.com', hashPassword('Digiano2026'), 'admin', 0).lastInsertRowid;
  const lucianoId = insUser.run('Luciano', 'luciano', 'luciano@digiano.com', hashPassword('Digiano2026'), 'comercial', 1).lastInsertRowid;
  const nataliaId = insUser.run('Natalia', 'natalia', 'natalia@digiano.com', hashPassword('Digiano2026'), 'siniestros', 1).lastInsertRowid;
  insUser.run('Juliana', 'juliana', 'juliana@digiano.com', hashPassword('Digiano2026'), 'marketing', 1).lastInsertRowid;

  // ---- Cartera real de clientes ----
  const n = importClients(adminId);
  console.log(`  Clientes importados de la cartera: ${n}`);

  // ---- Objetivo activo ----
  db.prepare(
    `INSERT INTO objectives (name,branch,target,avg_commission,start_date,end_date,active,responsible)
     VALUES (?,?,?,?, date('now','start of month'), date('now','start of month','+1 month','-1 day'), 1, ?)`
  ).run('Hogares Junio', 'Hogar', 15, 4000, adminId);

  // ---- Campana de ejemplo (Auto sin Hogar) ----
  db.prepare(
    `INSERT INTO campaigns (name,branch,target_product,goal,start_date,end_date,active)
     VALUES (?,?,?,?, date('now','start of month'), date('now','start of month','+1 month','-1 day'), 1)`
  ).run('Auto sin Hogar', 'Hogar', 'Hogar', 30);

  // ---- Score inicial de ejemplo (para que el ranking no este vacio) ----
  const insScore = db.prepare(`INSERT INTO score_events (user_id,points,reason,created_at) VALUES (?,?,?, datetime('now', ?))`);
  insScore.run(lucianoId, 25, 'Venta cerrada / alta lograda', '-5 days');
  insScore.run(lucianoId, 8, 'Cotizacion enviada', '-3 days');
  insScore.run(nataliaId, 1, 'Tarea completada', '-2 days');

  console.log('Seed completo. Usuarios: admin@digiano.com / luciano@digiano.com / natalia@digiano.com  (pass: Digiano2026)');
}

// Permite ejecutar `node server/seed.js` directamente.
if (import.meta.url === `file://${process.argv[1]}`) ensureSeed();
