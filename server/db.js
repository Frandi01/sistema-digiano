// Base de datos SQLite nativa de Node (sin dependencias externas).
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// La carpeta de datos es configurable (DATA_DIR) para usar un disco
// persistente en hosting administrado. Por defecto: <proyecto>/data.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'digiano.db');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
-- ============ USUARIOS Y SEGURIDAD ============
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin','comercial','siniestros','marketing')),
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ CLIENTES (fuente de verdad) ============
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  observations TEXT,
  tags TEXT,                 -- CSV de etiquetas
  status TEXT NOT NULL DEFAULT 'aprobado' CHECK(status IN ('aprobado','pendiente')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Productos/polizas contratadas por el cliente
CREATE TABLE IF NOT EXISTS policies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  branch TEXT NOT NULL,        -- Auto, Hogar, Vida, ART, Comercio, AP, Caucion
  company TEXT,
  policy_number TEXT,
  premium REAL DEFAULT 0,      -- prima mensual estimada
  status TEXT NOT NULL DEFAULT 'vigente' CHECK(status IN ('vigente','baja')),
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ MOVIMIENTOS (altas / bajas) ============
CREATE TABLE IF NOT EXISTS movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL CHECK(type IN ('alta','baja')),
  branch TEXT NOT NULL,
  company TEXT,
  policy_number TEXT,
  premium REAL DEFAULT 0,
  commission REAL DEFAULT 0,   -- comision estimada del movimiento
  note TEXT,
  status TEXT NOT NULL DEFAULT 'aprobado' CHECK(status IN ('pendiente','aprobado','rechazado')),
  created_by INTEGER REFERENCES users(id),
  approved_by INTEGER REFERENCES users(id),
  source_task_id INTEGER,      -- si se origino desde una tarea comercial
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

-- ============ TAREAS ============
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK(kind IN ('comercial','operativa')),
  title TEXT NOT NULL,
  offer TEXT,                  -- que ofrecer (tareas comerciales): Hogar, Vida, etc.
  client_id INTEGER REFERENCES clients(id),
  assigned_to INTEGER REFERENCES users(id),
  created_by INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pendiente'
    CHECK(status IN ('pendiente','en_proceso','completada','vencida')),
  -- resultado de gestion comercial
  result TEXT CHECK(result IN (
    'no_contactado','no_respondio','contactado','cotizacion_enviada',
    'venta_cerrada','no_interesado','inviable')),
  reason TEXT,                 -- motivo de no_interesado / inviable
  result_note TEXT,
  due_date TEXT,
  follow_up_date TEXT,         -- proximo seguimiento (cotizacion enviada)
  campaign_id INTEGER REFERENCES campaigns(id),
  active INTEGER NOT NULL DEFAULT 1,  -- tarea comercial sigue ocupando un cupo
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);

-- ============ SINIESTROS ============
CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  type TEXT NOT NULL,          -- Auto, Hogar, etc.
  company TEXT,
  incident_date TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'abierto' CHECK(status IN (
    'abierto','documentacion_pendiente','presentado','en_analisis','liquidado','cerrado')),
  created_by INTEGER REFERENCES users(id),
  assigned_to INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);

CREATE TABLE IF NOT EXISTS claim_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  claim_id INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id),
  text TEXT NOT NULL,
  kind TEXT DEFAULT 'nota',    -- nota, estado, creacion
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ OBJETIVOS ============
CREATE TABLE IF NOT EXISTS objectives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  branch TEXT,
  target REAL NOT NULL DEFAULT 0,   -- meta (cantidad de altas)
  avg_commission REAL DEFAULT 0,    -- comision promedio estimada por alta
  priority TEXT DEFAULT 'media',    -- alta / media / baja (orden de generacion de tareas)
  responsible INTEGER REFERENCES users(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ CAMPANAS ============
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  branch TEXT,                 -- ramo objetivo (ej Hogar)
  target_product TEXT,         -- producto a ofrecer
  goal INTEGER DEFAULT 0,      -- cantidad objetivo de cierres
  priority TEXT DEFAULT 'media',  -- alta / media / baja
  start_date TEXT,
  end_date TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ SCORE / RANKING ============
CREATE TABLE IF NOT EXISTS score_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref_type TEXT,
  ref_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS score_config (
  key TEXT PRIMARY KEY,
  points INTEGER NOT NULL,
  label TEXT
);

-- ============ HISTORIAL UNIFICADO DEL CLIENTE ============
CREATE TABLE IF NOT EXISTS client_timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type TEXT NOT NULL,          -- alta, baja, contacto, cotizacion, observacion, siniestro, tarea
  text TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  ref_type TEXT,
  ref_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ NOTIFICACIONES ============
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  link TEXT,                   -- ruta del SPA (#/siniestros/3)
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ AUDITORIA ============
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============ LIQUIDACION DE COMISIONES ============
CREATE TABLE IF NOT EXISTS commission_periods (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period TEXT NOT NULL UNIQUE,        -- 'YYYY-MM'
  suma1 REAL DEFAULT 0,
  suma2 REAL DEFAULT 0,
  suma3 REAL DEFAULT 0,
  marketing REAL DEFAULT 0,
  gastos_varios REAL DEFAULT 0,
  c_rubrica REAL DEFAULT 15000,
  c_contador REAL DEFAULT 50000,
  c_monotributo REAL DEFAULT 285678.23,
  c_luciano_fijo REAL DEFAULT 100000,
  reserva_pct REAL DEFAULT 0.05,
  pct_fernando REAL DEFAULT 0.45,
  pct_natalia REAL DEFAULT 0.15,
  pct_grupo REAL DEFAULT 0.40,        -- Franco + Luciano
  factor_luciano REAL DEFAULT 0.17,   -- porcion de Luciano dentro del grupo
  extraordinario REAL DEFAULT 0,      -- aguinaldo / ingreso extraordinario (no computable)
  status TEXT NOT NULL DEFAULT 'borrador' CHECK(status IN ('borrador','calculado','cerrado','pagado')),
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS commission_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id INTEGER NOT NULL REFERENCES commission_periods(id) ON DELETE CASCADE,
  person TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id),
  amount REAL DEFAULT 0
);

-- ============ AVISOS / CIRCULARES ============
CREATE TABLE IF NOT EXISTS avisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('baja','normal','alta')),
  audience TEXT NOT NULL DEFAULT 'todos',   -- todos / comercial / siniestros / user
  target_user_id INTEGER REFERENCES users(id),
  pinned INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS aviso_reads (
  aviso_id INTEGER NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  read_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (aviso_id, user_id)
);

-- ============ "VISTO" POR SECCION (puntitos de notificacion) ============
CREATE TABLE IF NOT EXISTS section_seen (
  user_id INTEGER NOT NULL REFERENCES users(id),
  section TEXT NOT NULL,
  last_seen TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, section)
);

-- ============ SOLICITUDES DE CAMBIO (aprobacion de cambios sensibles) ============
CREATE TABLE IF NOT EXISTS change_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                 -- cliente_nuevo, cliente_editar, poliza, etc.
  entity_type TEXT,
  entity_id INTEGER,
  client_id INTEGER REFERENCES clients(id),
  payload TEXT,                       -- JSON con los cambios propuestos
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','aprobado','rechazado')),
  requested_by INTEGER REFERENCES users(id),
  resolved_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
`);

// ---- Migraciones idempotentes (agregar columnas a tablas existentes) ----
function addColumn(table, col, def) {
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch (e) { /* ya existe */ }
}
addColumn('users', 'username', 'TEXT');
for (const t of ['tasks', 'campaigns', 'objectives']) {
  addColumn(t, 'deleted', 'INTEGER NOT NULL DEFAULT 0');
  addColumn(t, 'deleted_by', 'INTEGER');
  addColumn(t, 'deleted_at', 'TEXT');
}
addColumn('campaigns', 'priority', "TEXT DEFAULT 'media'");
addColumn('objectives', 'priority', "TEXT DEFAULT 'media'");
addColumn('tasks', 'updated_at', 'TEXT');

// ---- Tablas de marketing (idempotentes) ----
db.exec(`
CREATE TABLE IF NOT EXISTS marketing_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  text TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS marketing_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  description TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','en_progreso','completado')),
  result_notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT
);
`);

// Migración: ampliar CHECK de role en bases existentes para incluir 'marketing'.
// SQLite no permite ALTER COLUMN, así que se recrea la tabla si el esquema es el viejo.
try {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (schema && schema.sql && !schema.sql.includes("'marketing'")) {
    db.exec(`
      PRAGMA foreign_keys = OFF;
      BEGIN;
      ALTER TABLE users RENAME TO _users_old;
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','comercial','siniestros','marketing')),
        active INTEGER NOT NULL DEFAULT 1,
        must_change_password INTEGER NOT NULL DEFAULT 1,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        last_login TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        username TEXT
      );
      INSERT INTO users SELECT * FROM _users_old;
      DROP TABLE _users_old;
      COMMIT;
      PRAGMA foreign_keys = ON;
    `);
    console.log('  Migración: columna role de users actualizada para incluir marketing.');
  }
} catch (e) { console.warn('  Migración role users:', e.message); }

// Backfill de username para bases existentes (deriva del email).
try {
  db.exec("UPDATE users SET username = lower(substr(email,1,instr(email,'@')-1)) WHERE (username IS NULL OR username='') AND email LIKE '%@%'");
} catch (e) { /* noop */ }
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');

export default db;
