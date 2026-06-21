// Importa la cartera real (server/clientes.json) a una base YA existente.
// Idempotente: no duplica clientes (compara por nombre) y limpia los
// clientes de ejemplo si quedaron de una version anterior.
//
//   Uso:  node server/import-clientes.js
//
import db from './db.js';
import { ensureSeed, importClients } from './seed.js';

ensureSeed(); // asegura que existan usuarios y config

const admin = db.prepare("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1").get();
if (!admin) { console.error('No hay administrador en la base.'); process.exit(1); }

// Nombres de los clientes de demostracion de la version inicial.
const DEMO = ['Carlos Gomez', 'Maria Lopez', 'Juan Perez', 'Sofia Martinez', 'Estudio Contable RYV',
  'Diego Fernandez', 'Laura Sanchez', 'Pedro Ramirez', 'Comercio El Sol', 'Ana Torres'];

db.exec('BEGIN');
try {
  for (const name of DEMO) {
    const c = db.prepare('SELECT id FROM clients WHERE name = ?').get(name);
    if (!c) continue;
    const claims = db.prepare('SELECT id FROM claims WHERE client_id=?').all(c.id);
    for (const cl of claims) db.prepare('DELETE FROM claim_events WHERE claim_id=?').run(cl.id);
    db.prepare('DELETE FROM claims WHERE client_id=?').run(c.id);
    db.prepare('DELETE FROM movements WHERE client_id=?').run(c.id);
    db.prepare('DELETE FROM tasks WHERE client_id=?').run(c.id);
    db.prepare('DELETE FROM clients WHERE id=?').run(c.id); // polizas/timeline en cascada
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK');
  throw e;
}

const added = importClients(admin.id);
const total = db.prepare('SELECT COUNT(*) n FROM clients').get().n;
console.log(`Cartera importada. Clientes nuevos: ${added}. Total en el sistema: ${total}.`);
