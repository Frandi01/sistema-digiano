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

// Contraseña inicial de bootstrap: se toma de la variable de entorno
// SEED_PASSWORD; si no esta definida, se genera una aleatoria que se imprime
// UNA sola vez en el log del servidor (no es accesible desde el navegador).
// Nunca hay una contraseña fija en el codigo.
function bootstrapPassword() {
  if (process.env.SEED_PASSWORD && process.env.SEED_PASSWORD.length >= 8) return { pw: process.env.SEED_PASSWORD, generated: false };
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let pw = ''; for (let i = 0; i < 12; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return { pw: pw + '7a', generated: true };
}

export function ensureSeed() {
  // Config de score (siempre asegura claves).
  const scoreStmt = db.prepare('INSERT OR IGNORE INTO score_config (key,points,label) VALUES (?,?,?)');
  for (const [key, points, label] of DEFAULT_SCORE) scoreStmt.run(key, points, label);

  const count = db.prepare('SELECT COUNT(*) n FROM users').get().n;
  if (count > 0) {
    // Base ya sembrada: solo asegurar (idempotente) que exista Juliana, para
    // bases creadas antes de incorporar el rol marketing.
    const juliana = db.prepare("SELECT id FROM users WHERE username='juliana'").get();
    if (!juliana) {
      try {
        db.prepare(
          `INSERT INTO users (name,username,email,password_hash,role,active,must_change_password) VALUES (?,?,?,?,?,1,1)`
        ).run('Juliana', 'juliana', 'juliana@digiano.com', hashPassword(bootstrapPassword().pw), 'marketing');
        console.log('  Usuario Juliana (marketing) creado.');
      } catch (e) { console.warn('  No se pudo crear usuario Juliana:', e.message); }
    }
    return;
  }

  console.log('Sembrando datos iniciales...');
  const boot = bootstrapPassword();

  // ---- Usuarios ---- (login por nombre de usuario). Todos deben cambiar la
  // contraseña en el primer ingreso (must_change_password = 1).
  const insUser = db.prepare(
    `INSERT INTO users (name,username,email,password_hash,role,active,must_change_password) VALUES (?,?,?,?,?,1,1)`
  );
  const adminId = insUser.run('Franco Digiano', 'admin', 'admin@digiano.com', hashPassword(boot.pw), 'admin').lastInsertRowid;
  const lucianoId = insUser.run('Luciano', 'luciano', 'luciano@digiano.com', hashPassword(boot.pw), 'comercial').lastInsertRowid;
  const nataliaId = insUser.run('Natalia', 'natalia', 'natalia@digiano.com', hashPassword(boot.pw), 'siniestros').lastInsertRowid;
  insUser.run('Juliana', 'juliana', 'juliana@digiano.com', hashPassword(boot.pw), 'marketing').lastInsertRowid;

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

  // (Sin score de ejemplo: el ranking refleja solo actividad real registrada.)
  void lucianoId; void nataliaId;

  if (boot.generated) {
    console.log('Seed completo. Usuarios: admin, luciano, natalia, juliana.');
    console.log('  CONTRASEÑA INICIAL (generada, anotala; cada usuario debera cambiarla al ingresar): ' + boot.pw);
  } else {
    console.log('Seed completo. Usuarios: admin, luciano, natalia, juliana. Contraseña inicial: la definida en SEED_PASSWORD (cambio obligatorio al ingresar).');
  }
}

// Permite ejecutar `node server/seed.js` directamente.
if (import.meta.url === `file://${process.argv[1]}`) ensureSeed();
