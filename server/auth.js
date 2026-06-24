// Autenticacion segura: login email+password, sesiones por token (cookie),
// bloqueo por intentos fallidos, cambio obligatorio de contrasena, timeout
// por inactividad y middleware de roles.
import crypto from 'crypto';
import db from './db.js';
import { audit } from './helpers.js';

const INACTIVITY_MINUTES = 30;   // cierre de sesion por inactividad
const MAX_ATTEMPTS = 5;          // intentos antes de bloquear
const LOCK_MINUTES = 15;         // duracion del bloqueo

// Hash seguro de contrasena con scrypt (sin dependencias externas).
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const dk = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return `scrypt$${salt}$${dk}`;
}

function verifyPassword(pw, stored) {
  try {
    const [, salt, dk] = (stored || '').split('$');
    if (!salt || !dk) return false;
    const calc = crypto.scryptSync(String(pw), salt, 32);
    const a = Buffer.from(dk, 'hex');
    return a.length === calc.length && crypto.timingSafeEqual(a, calc);
  } catch (e) { return false; }
}

// Politica de contrasena segura.
export function validatePasswordStrength(pw) {
  if (!pw || pw.length < 8) return 'La contrasena debe tener al menos 8 caracteres.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw))
    return 'La contrasena debe incluir letras y numeros.';
  return null;
}

function newToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function login(username, password, ip) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get((username || '').toLowerCase().trim());
  if (!user) return { error: 'Usuario o contrasena incorrectos.' };
  if (!user.active) return { error: 'Usuario desactivado. Contacte al administrador.' };

  // Bloqueo temporal por intentos fallidos.
  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    return { error: 'Cuenta bloqueada temporalmente por intentos fallidos. Reintente mas tarde.' };
  }

  if (!verifyPassword(password || '', user.password_hash)) {
    const attempts = user.failed_attempts + 1;
    let locked = null;
    if (attempts >= MAX_ATTEMPTS) {
      locked = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
    }
    db.prepare('UPDATE users SET failed_attempts=?, locked_until=? WHERE id=?')
      .run(attempts, locked, user.id);
    audit(user.id, 'login_fallido', 'user', user.id, `Intento ${attempts} desde ${ip || '-'}`);
    return { error: locked ? 'Demasiados intentos. Cuenta bloqueada 15 minutos.' : 'Usuario o contrasena incorrectos.' };
  }

  // Login correcto: resetea contador y crea sesion.
  db.prepare('UPDATE users SET failed_attempts=0, locked_until=NULL, last_login=datetime(\'now\') WHERE id=?')
    .run(user.id);
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?,?)').run(token, user.id);
  audit(user.id, 'login', 'user', user.id, `Ingreso desde ${ip || '-'}`);
  return { token, user: publicUser(user) };
}

export function logout(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token=?').run(token);
}

export function publicUser(u) {
  return {
    id: u.id, name: u.name, username: u.username, email: u.email, role: u.role,
    must_change_password: !!u.must_change_password, active: !!u.active,
  };
}

// Middleware: valida sesion y aplica timeout por inactividad.
export function requireAuth(req, res, next) {
  const token = req.cookies?.sid;
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  const sess = db.prepare('SELECT * FROM sessions WHERE token=?').get(token);
  if (!sess) return res.status(401).json({ error: 'Sesion invalida' });

  const idleMs = Date.now() - new Date(sess.last_seen + 'Z').getTime();
  if (idleMs > INACTIVITY_MINUTES * 60000) {
    db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    return res.status(401).json({ error: 'Sesion expirada por inactividad' });
  }
  db.prepare('UPDATE sessions SET last_seen=datetime(\'now\') WHERE token=?').run(token);

  const user = db.prepare('SELECT * FROM users WHERE id=?').get(sess.user_id);
  if (!user || !user.active) return res.status(401).json({ error: 'Usuario no disponible' });
  req.user = user;
  req.token = token;

  // Bloqueo backend de cambio de contraseña obligatorio: si el usuario tiene
  // must_change_password, solo puede usar /auth/me, /auth/change-password y
  // /auth/logout. Cualquier otro endpoint responde 403 (aplica a todos los roles).
  if (user.must_change_password) {
    const path = req.path || '';
    const allowed = path.endsWith('/auth/me') || path.endsWith('/auth/change-password') || path.endsWith('/auth/logout');
    if (!allowed) return res.status(403).json({ error: 'Debe cambiar la contraseña antes de continuar.' });
  }
  next();
}

// Middleware de roles.
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role))
      return res.status(403).json({ error: 'Sin permisos para esta accion' });
    next();
  };
}
export function changePassword(user, currentPw, newPw, force) {
  // En el primer ingreso forzado no exige la actual.
  if (!force && !verifyPassword(currentPw || '', user.password_hash)) {
    return 'La contrasena actual es incorrecta.';
  }
  const strErr = validatePasswordStrength(newPw);
  if (strErr) return strErr;
  db.prepare('UPDATE users SET password_hash=?, must_change_password=0 WHERE id=?')
    .run(hashPassword(newPw), user.id);
  audit(user.id, 'cambio_password', 'user', user.id, null);
  return null;
}

export { INACTIVITY_MINUTES };
