// Micro-framework HTTP compatible con el subconjunto de Express que usa la app.
// Sin dependencias externas (solo Node nativo).
import http from 'http';
import fs from 'fs';
import path from 'path';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function compile(p) {
  if (p === '*') return { regex: /^.*$/, keys: [] };
  const keys = [];
  const regex = new RegExp('^' + p.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '/?$');
  return { regex, keys };
}

export function Router() {
  const routes = [];
  const add = (method) => (p, ...handlers) => { const c = compile(p); routes.push({ method, ...c, handlers }); };
  return { routes, get: add('GET'), post: add('POST'), put: add('PUT'), delete: add('DELETE') };
}

export default function express() {
  const globals = [];
  const routes = [];

  const app = {
    use(a, b) {
      if (typeof a === 'function') globals.push(a);
      else if (b && b.routes) { // montar router con prefijo
        for (const r of b.routes) routes.push({ ...r, ...prefix(a, r) });
      } else if (typeof a === 'function') globals.push(a);
      else if (typeof b === 'function') globals.push(b); // app.use(path, fn) -> global
    },
    listen(port, cb) {
      http.createServer((rawReq, rawRes) => handle(rawReq, rawRes, globals, routes)).listen(port, cb);
    },
  };
  for (const m of ['get', 'post', 'put', 'delete']) {
    app[m] = (p, ...handlers) => { const c = compile(p); routes.push({ method: m.toUpperCase(), ...c, handlers }); };
  }
  return app;
}

function prefix(pre, route) {
  // re-compila la ruta con prefijo
  const orig = route.regex.source.replace(/^\^/, '').replace(/\/\?\$$/, '');
  const full = '^' + escapeRe(pre) + orig + '/?$';
  return { regex: new RegExp(full) };
}
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

express.Router = Router;
express.json = () => (req, res, next) => next();
express.static = (dir) => (req, res, next) => {
  if (req.method !== 'GET') return next();
  let p = decodeURIComponent(req.path);
  if (p === '/') p = '/index.html';
  const file = path.join(dir, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(dir)) return next();
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return next();
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
};

async function handle(rawReq, rawRes, globals, routes) {
  const u = new URL(rawReq.url, 'http://localhost');
  const req = rawReq;
  req.path = u.pathname;
  req.query = Object.fromEntries(u.searchParams);
  req.cookies = parseCookies(rawReq.headers.cookie);
  req.ip = (rawReq.headers['x-forwarded-for'] || rawReq.socket.remoteAddress || '').toString();
  req.body = await readBody(rawReq);

  const res = augment(rawRes);

  // match de ruta
  let matched = null;
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = r.regex.exec(req.path);
    if (m) { req.params = {}; r.keys?.forEach((k, i) => (req.params[k] = decodeURIComponent(m[i + 1]))); matched = r; break; }
  }

  const stack = [...globals];
  if (matched) stack.push(...matched.handlers);
  else stack.push((rq, rs) => rs.status(404).json({ error: 'No encontrado' }));

  let i = 0;
  const next = (err) => {
    if (err) return res.status(500).json({ error: String(err.message || err) });
    const fn = stack[i++];
    if (!fn) return;
    try { fn(req, res, next); } catch (e) { res.status(500).json({ error: String(e.message || e) }); }
  };
  next();
}

function augment(res) {
  res.statusCode = 200;
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (obj) => { res.writeHead(res.statusCode, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
  res.send = (s) => { res.writeHead(res.statusCode, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(s); };
  res.sendFile = (f) => { fs.readFile(f, (e, d) => { if (e) { res.status(404).end('Not found'); } else { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(d); } }); };
  res._cookies = [];
  res.cookie = (name, val, opts = {}) => {
    let c = `${name}=${val}; Path=${opts.path || '/'}; HttpOnly; SameSite=Lax`;
    if (opts.maxAge) c += `; Max-Age=${Math.round(opts.maxAge / 1000)}`;
    res._cookies.push(c); applyCookies(res); return res;
  };
  res.clearCookie = (name) => { res._cookies.push(`${name}=; Path=/; Max-Age=0`); applyCookies(res); return res; };
  return res;
}
function applyCookies(res) { res.setHeader('Set-Cookie', res._cookies); }

function parseCookies(header) {
  const out = {};
  (header || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > -1) out[p.slice(0, i).trim()] = p.slice(i + 1).trim(); });
  return out;
}
function readBody(req) {
  return new Promise((resolve) => {
    if (req.method === 'GET' || req.method === 'DELETE') return resolve({});
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// cookie-parser compat (no-op, ya parseamos en handle)
export const cookieParser = () => (req, res, next) => next();
