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
  email TEXT UNIQUE,             -- opcional (login es por username)
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,            -- validado en la capa de aplicacion (api.js)
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
// --- Modelo de Campañas (antes "Objetivos") ---
addColumn('objectives', 'type', "TEXT DEFAULT 'comercial'");        // comercial | marketing
addColumn('objectives', 'part_comercial', 'INTEGER DEFAULT 1');     // areas participantes
addColumn('objectives', 'part_marketing', 'INTEGER DEFAULT 0');
addColumn('objectives', 'part_admin', 'INTEGER DEFAULT 0');
addColumn('objectives', 'qty_reel', 'INTEGER DEFAULT 0');           // cantidades de marketing
addColumn('objectives', 'qty_carrusel', 'INTEGER DEFAULT 0');
addColumn('objectives', 'qty_historia', 'INTEGER DEFAULT 0');
addColumn('objectives', 'qty_linkedin', 'INTEGER DEFAULT 0');
addColumn('marketing_tasks', 'campaign_id', 'INTEGER');             // vinculo tarea -> campaña
addColumn('marketing_tasks', 'auto', 'INTEGER DEFAULT 0');          // generada por campaña
addColumn('marketing_tasks', 'week_start', 'TEXT');                 // inicio del ciclo semanal de la tanda
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
  status TEXT NOT NULL DEFAULT 'pendiente',
  result_notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  campaign_id INTEGER,
  auto INTEGER DEFAULT 0,
  week_start TEXT
);

-- ============ PIPELINE DE CONTENIDO (marketing) ============
CREATE TABLE IF NOT EXISTS mkt_content (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  format TEXT,                  -- reel, carrusel, historia, post, video
  status TEXT NOT NULL DEFAULT 'idea',  -- idea, guion, pend_grabar, grabado, editando, revision, programado, publicado
  campaign_id INTEGER REFERENCES objectives(id),
  archived INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

-- ============ BANCO DE IDEAS (marketing) ============
CREATE TABLE IF NOT EXISTS mkt_ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  objective TEXT,
  priority TEXT NOT NULL DEFAULT 'media',  -- alta, media, baja
  tags TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ---- Fase 3: metricas de contenido, archivado de campañas y biblioteca de marca ----
addColumn('mkt_content', 'metrics_views', 'INTEGER');
addColumn('mkt_content', 'metrics_reach', 'INTEGER');
addColumn('mkt_content', 'metrics_likes', 'INTEGER');
addColumn('mkt_content', 'metrics_comments', 'INTEGER');
addColumn('mkt_content', 'published_at', 'TEXT');
addColumn('mkt_content', 'pending_metrics', 'INTEGER DEFAULT 0');
addColumn('objectives', 'archived', 'INTEGER DEFAULT 0');
db.exec("CREATE TABLE IF NOT EXISTS mkt_brand (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, url TEXT NOT NULL, category TEXT, created_by INTEGER REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));");

// Migración: quitar el CHECK del campo role (los roles se validan en la capa de
// aplicacion, ver api.js). Asi agregar roles nuevos no requiere recrear la tabla.
// Tambien se libera email de NOT NULL (es opcional al crear usuarios desde el panel).
// SQLite no permite ALTER COLUMN, asi que se recrea la tabla si el esquema viejo
// todavia tiene el CHECK sobre role.
// IMPORTANTE: se sigue el procedimiento oficial de SQLite (crear tabla nueva,
// copiar, DROP de la vieja, RENAME de la nueva). NO se renombra 'users' a un
// nombre temporal: hacerlo provoca que SQLite reescriba las claves foraneas de
// las demas tablas (sessions, clients, etc.) apuntandolas al nombre temporal,
// que luego deja de existir. Al renombrar 'users_new' (a la que nada referencia)
// hacia 'users', las FK ajenas siguen apuntando a 'users' y quedan intactas.
try {
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'").get();
  if (schema && schema.sql && /CHECK\s*\(\s*role/i.test(schema.sql)) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`
        CREATE TABLE users_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          must_change_password INTEGER NOT NULL DEFAULT 1,
          failed_attempts INTEGER NOT NULL DEFAULT 0,
          locked_until TEXT,
          last_login TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          username TEXT
        )`);
      // Columnas explicitas: robusto ante diferencias de orden entre bases.
      db.exec(`INSERT INTO users_new
        (id,name,email,password_hash,role,active,must_change_password,failed_attempts,locked_until,last_login,created_at,username)
        SELECT id,name,email,password_hash,role,active,must_change_password,failed_attempts,locked_until,last_login,created_at,username
        FROM users`);
      db.exec('DROP TABLE users');
      db.exec('ALTER TABLE users_new RENAME TO users');
      db.exec('COMMIT');
      console.log('  Migracion: CHECK de role eliminado (validacion movida a la app).');
    } catch (inner) {
      db.exec('ROLLBACK');
      throw inner;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
} catch (e) { console.warn('  Migracion role users:', e.message); }

// Reparacion: una migracion anterior (defectuosa) renombro 'users' a un nombre
// temporal y SQLite reescribio las claves foraneas de las demas tablas hacia
// '_users_old', que luego se elimino. Eso deja FKs apuntando a una tabla
// inexistente y rompe cualquier INSERT (notifications, sessions, etc.).
// Aca se reconstruye cada tabla afectada haciendo que vuelva a apuntar a 'users'.
try {
  const broken = db.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type='table' AND sql LIKE '%_users_old%'"
  ).all();
  if (broken.length) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      for (const t of broken) {
        const tmp = t.name + '__fix';
        let createSql = t.sql.replace(/_users_old/g, 'users');
        createSql = createSql.replace(
          new RegExp('CREATE\\s+TABLE\\s+(IF\\s+NOT\\s+EXISTS\\s+)?["\'`]?' + t.name + '["\'`]?', 'i'),
          'CREATE TABLE "' + tmp + '"'
        );
        db.exec(createSql);
        db.exec(`INSERT INTO "${tmp}" SELECT * FROM "${t.name}"`);
        db.exec(`DROP TABLE "${t.name}"`);
        db.exec(`ALTER TABLE "${tmp}" RENAME TO "${t.name}"`);
      }
      db.exec('COMMIT');
      console.log(`  Reparacion: referencias a _users_old corregidas en ${broken.length} tabla(s).`);
    } catch (inner) {
      db.exec('ROLLBACK');
      throw inner;
    } finally {
      db.exec('PRAGMA foreign_keys = ON');
    }
  }
} catch (e) { console.warn('  Reparacion _users_old:', e.message); }

// Backfill de username para bases existentes (deriva del email).
try {
  db.exec("UPDATE users SET username = lower(substr(email,1,instr(email,'@')-1)) WHERE (username IS NULL OR username='') AND email LIKE '%@%'");
} catch (e) { /* noop */ }
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username)');

// ---- Unificacion de estados: marketing_tasks usaba 'en_progreso'/'completado'.
// Se estandariza a 'en_proceso'/'completada' (igual que las tareas comerciales) y
// se elimina el CHECK que impedia esos valores. Idempotente.
try {
  const mt = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='marketing_tasks'").get();
  if (mt && /en_progreso/.test(mt.sql || '')) {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('BEGIN');
    try {
      db.exec(`CREATE TABLE marketing_tasks__new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        description TEXT,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'pendiente',
        result_notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        campaign_id INTEGER,
        auto INTEGER DEFAULT 0,
        week_start TEXT
      )`);
      const cols = db.prepare("PRAGMA table_info('marketing_tasks')").all().map((c) => c.name);
      const common = ['id','type','description','due_date','status','result_notes','created_by','created_at','completed_at','campaign_id','auto','week_start'].filter((c) => cols.includes(c));
      db.exec(`INSERT INTO marketing_tasks__new (${common.join(',')}) SELECT ${common.join(',')} FROM marketing_tasks`);
      db.exec('DROP TABLE marketing_tasks');
      db.exec('ALTER TABLE marketing_tasks__new RENAME TO marketing_tasks');
      db.exec("UPDATE marketing_tasks SET status='en_proceso' WHERE status='en_progreso'");
      db.exec("UPDATE marketing_tasks SET status='completada' WHERE status='completado'");
      db.exec('COMMIT');
      console.log('  Migracion: estados de marketing_tasks unificados (en_proceso/completada).');
    } catch (inner) { db.exec('ROLLBACK'); throw inner; }
    finally { db.exec('PRAGMA foreign_keys = ON'); }
  }
} catch (e) { console.warn('  Migracion estados marketing_tasks:', e.message); }

// ---- Tabla de metadatos de la app (marcadores de migraciones de una sola vez) ----
db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))");

// ---- Rotacion de seguridad (una sola vez por base) ----
// Invalida cualquier contraseña temporal conocida previa: fuerza cambio de
// contraseña a TODOS los usuarios, cierra todas las sesiones activas y elimina
// los puntos de score sin referencia real (datos demo). Idempotente: corre una
// unica vez, controlada por un marcador en app_meta.
try {
  const done = db.prepare("SELECT 1 FROM app_meta WHERE key='security_rotation_v1'").get();
  if (!done) {
    db.exec('BEGIN');
    try {
      db.exec('UPDATE users SET must_change_password=1');
      db.exec('DELETE FROM sessions');
      // Quita puntos demo/importados sin referencia (no representan actividad real).
      try { db.exec('DELETE FROM score_events WHERE ref_type IS NULL AND ref_id IS NULL'); } catch (e) { /* tabla puede no existir aun */ }
      db.prepare("INSERT INTO app_meta (key,value) VALUES ('security_rotation_v1', datetime('now'))").run();
      db.exec('COMMIT');
      console.log('  Rotacion de seguridad aplicada: cambio de contraseña forzado, sesiones invalidadas, score demo depurado.');
    } catch (inner) { db.exec('ROLLBACK'); throw inner; }
  }
} catch (e) { console.warn('  Rotacion de seguridad:', e.message); }

export default db;
