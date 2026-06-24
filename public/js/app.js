import { api } from './api.js';
import {
  icons, fmtMoney, fmtDate, fmtDateTime, initials, esc, toast, openModal, badge,
} from './ui.js';
import { renderDashboard } from './views/dashboard.js';
import { renderClients, renderClientDetail } from './views/clients.js';
import { renderMovements } from './views/movements.js';
import { renderTodayTasks, renderOperativeTasks, renderFollowups, renderMyPerformance } from './views/tasks.js';
import { renderClaims, renderClaimDetail } from './views/claims.js';
import {
  renderApprovals, renderObjectives, renderUsers, renderAudit, renderRanking,
  renderTrash, renderMetrics, renderAvisosAdmin, renderSupervision, clearSupervisionInterval,
  renderObjectivesArchived, renderCampaignDetail,
} from './views/admin.js';
import { renderCommissionsAdmin, renderMyCommission } from './views/commissions.js';
import { renderMarketing } from './views/marketing.js';
import { renderBancoIdeas } from './views/bancoideas.js';
import { renderBrandLibrary } from './views/biblioteca.js';

export const state = { user: null, branches: [], labels: {} };

const NAV = {
  admin: [
    ['Principal', [['dashboard', 'Dashboard', 'dashboard']]],
    ['Mi trabajo', [['tareas-hoy', 'Tareas de hoy', 'today'], ['seguimientos', 'Seguimientos', 'followups']]],
    ['Gestion', [['clientes', 'Clientes', 'clients'], ['tareas', 'Tareas', 'tasks'], ['siniestros', 'Siniestros', 'claims']]],
    ['Analisis', [['comisiones', 'Comisiones', 'money'], ['metricas', 'Metricas', 'metrics']]],
    ['Administracion', [['aprobaciones', 'Aprobaciones', 'approvals'], ['objetivos', 'Campañas', 'objectives'], ['avisos', 'Avisos', 'bell'], ['supervision', 'Supervision', 'users'], ['marketing', 'Marketing', 'megaphone'], ['banco-ideas', 'Banco de Ideas', 'idea'], ['biblioteca', 'Biblioteca de Marca', 'idea'], ['usuarios', 'Usuarios', 'users'], ['auditoria', 'Auditoria', 'audit'], ['papelera', 'Papelera', 'trash']]],
  ],
  comercial: [
    ['Principal', [['dashboard', 'Dashboard', 'dashboard'], ['rendimiento', 'Mi rendimiento', 'ranking'], ['mi-comision', 'Mi comision', 'money']]],
    ['Mi trabajo', [['tareas-hoy', 'Tareas de hoy', 'today'], ['tareas', 'Tareas operativas', 'tasks'], ['seguimientos', 'Seguimientos', 'followups'], ['siniestros', 'Siniestros', 'claims']]],
    ['Gestion', [['clientes', 'Clientes', 'clients']]],
  ],
  siniestros: [
    ['Principal', [['dashboard', 'Dashboard', 'dashboard'], ['mi-comision', 'Mi comision', 'money']]],
    ['Gestion', [['siniestros', 'Siniestros', 'claims'], ['clientes', 'Clientes', 'clients'], ['tareas', 'Tareas', 'tasks']]],
  ],
  marketing: [
    ['Principal', [['dashboard', 'Dashboard', 'dashboard']]],
    ['Gestion', [['clientes', 'Clientes', 'clients']]],
    ['Mi panel', [['marketing', 'Pipeline y calendario', 'megaphone'], ['banco-ideas', 'Banco de Ideas', 'idea'], ['biblioteca', 'Biblioteca de Marca', 'idea']]],
  ],
};

// Rutas que se marcan como "vistas" al entrar (puntitos del menu).
const SEEN_SECTIONS = ['tareas-hoy', 'tareas', 'seguimientos', 'siniestros', 'aprobaciones', 'avisos'];

init();
async function init() {
  try {
    const { user } = await api.get('/auth/me');
    state.user = user;
    const meta = await api.get('/meta');
    state.branches = meta.branches; state.labels = meta.labels;
    if (user.must_change_password) return renderForcedPassword();
    renderApp();
  } catch (e) { renderLogin(); }
}

// ---------- Login (por nombre de usuario) ----------
function renderLogin(errMsg) {
  document.getElementById('root').innerHTML = `
    <div class="login-wrap">
      <div class="login-card">
        <img class="logo" src="/assets/logo-negro.png" alt="Digiano" />
        <div class="sub">Sistema de gestion interna</div>
        <form id="loginForm">
          <div class="field"><label>Usuario</label><input name="username" autocomplete="username" placeholder="tu usuario" required /></div>
          <div class="field"><label>Contrasena</label><input name="password" type="password" autocomplete="current-password" required /></div>
          <button class="btn block" type="submit">Ingresar</button>
          <div class="err">${errMsg ? esc(errMsg) : ''}</div>
        </form>
      </div>
    </div>`;
  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const { user } = await api.post('/auth/login', { username: f.get('username'), password: f.get('password') });
      state.user = user;
      const meta = await api.get('/meta'); state.branches = meta.branches; state.labels = meta.labels;
      if (user.must_change_password) return renderForcedPassword();
      location.hash = '#/dashboard';
      renderApp();
    } catch (err) { renderLogin(err.message); }
  });
}

function renderForcedPassword() {
  document.getElementById('root').innerHTML = `
    <div class="login-wrap"><div class="login-card">
      <img class="logo" src="/assets/logo-negro.png" />
      <div class="sub">Primer ingreso: defini una nueva contrasena</div>
      <form id="pwForm">
        <div class="field"><label>Nueva contrasena</label><input name="next" type="password" required /></div>
        <div class="field"><label>Repetir contrasena</label><input name="rep" type="password" required /></div>
        <button class="btn block" type="submit">Guardar y continuar</button>
        <div class="err" id="pwErr"></div>
      </form>
    </div></div>`;
  document.getElementById('pwForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (f.get('next') !== f.get('rep')) { document.getElementById('pwErr').textContent = 'Las contrasenas no coinciden.'; return; }
    try {
      await api.post('/auth/change-password', { next: f.get('next'), force: true });
      state.user.must_change_password = false;
      toast('Contrasena actualizada', 'green');
      location.hash = '#/dashboard'; renderApp();
    } catch (err) { document.getElementById('pwErr').textContent = err.message; }
  });
}

// ---------- App shell ----------
function renderApp() {
  const u = state.user;
  // Fallback defensivo: un rol sin layout definido no debe romper el shell
  // (si no, el boton de logout nunca se conecta y queda la sesion trabada).
  const nav = NAV[u.role] || [['Principal', [['dashboard', 'Dashboard', 'dashboard']]]];
  const navHtml = nav.map(([sec, items]) => `
    <div class="section">${sec}</div>
    ${items.map(([route, label, ic]) => `<a href="#/${route}" data-route="${route}">${icons[ic] || ''}<span>${label}</span></a>`).join('')}
  `).join('');

  document.getElementById('root').innerHTML = `
    <div class="app">
      <aside class="sidebar" id="sidebar">
        <div class="brand"><img src="/assets/logo-blanco.png" alt="Digiano" /></div>
        <nav class="nav">${navHtml}</nav>
        <div class="who">
          <div class="avatar">${initials(u.name)}</div>
          <div class="meta"><b>${esc(u.name)}</b><span>${u.role}</span></div>
          <button class="icon-btn" id="logoutBtn" title="Salir" style="width:32px;height:32px;background:#ffffff14;color:#cdd7e6">
            <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h6a2 2 0 002-2v-2M9 12h11l-3-3M20 12l-3 3"/></svg>
          </button>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="menu-btn" id="menuBtn">${icons.menu}</button>
          <h2 id="pageTitle">Dashboard</h2>
          <div class="spacer"></div>
          <div class="topsearch">
            <div class="search">${icons.search}<input id="gsearch" placeholder="Buscar cliente o N. poliza..." autocomplete="off" /></div>
            <div id="gresults"></div>
          </div>
          <button class="icon-btn" id="bellBtn">${icons.bell}<span class="badge-dot hidden" id="notifDot">0</span></button>
        </header>
        <div class="content" id="content"></div>
      </div>
    </div>`;

  document.getElementById('logoutBtn').onclick = async () => { await api.post('/auth/logout'); state.user = null; location.hash = ''; renderLogin(); };
  document.getElementById('menuBtn').onclick = () => document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('bellBtn').onclick = toggleNotifs;
  setupGlobalSearch();

  window.addEventListener('hashchange', route);
  loadNotifs(); refreshDots();
  setInterval(() => { loadNotifs(); refreshDots(); }, 60000);
  if (!location.hash) location.hash = '#/dashboard';
  route();
}

// ---------- Buscador global de clientes ----------
function setupGlobalSearch() {
  const input = document.getElementById('gsearch');
  const box = document.getElementById('gresults');
  let t;
  input.oninput = () => {
    clearTimeout(t);
    const q = input.value.trim();
    if (!q) { box.innerHTML = ''; return; }
    t = setTimeout(async () => {
      try {
        const { clients } = await api.get('/search/clients?q=' + encodeURIComponent(q));
        box.innerHTML = clients.length
          ? `<div class="search-results">${clients.map((c) => `<a href="#/clientes/${c.id}" data-go>${esc(c.name)}${c.phone ? ` <span class="muted">&middot; ${esc(c.phone)}</span>` : ''}</a>`).join('')}</div>`
          : `<div class="search-results"><a class="muted">Sin resultados</a></div>`;
        box.querySelectorAll('[data-go]').forEach((a) => a.onclick = () => { box.innerHTML = ''; input.value = ''; });
      } catch (e) {}
    }, 250);
  };
  document.addEventListener('click', (e) => { if (!document.querySelector('.topsearch')?.contains(e.target)) box.innerHTML = ''; });
}

// ---------- Puntitos de notificacion en el menu ----------
async function refreshDots() {
  try {
    const { counts } = await api.get('/sections/counts');
    document.querySelectorAll('.nav .nav-dot').forEach((d) => d.remove());
    for (const [section, n] of Object.entries(counts)) {
      if (!n) continue;
      let link = document.querySelector(`.nav a[data-route="${section}"]`);
      if (!link && section === 'avisos') link = document.querySelector('.nav a[data-route="dashboard"]');
      if (!link) continue;
      const dot = document.createElement('span');
      dot.className = 'nav-dot' + (n > 1 ? ' count' : '');
      dot.textContent = n > 1 ? (n > 99 ? '99' : n) : '';
      link.appendChild(dot);
    }
  } catch (e) {}
}

// ---------- Notificaciones (campana) ----------
async function loadNotifs() {
  try {
    const { unread } = await api.get('/notifications');
    const dot = document.getElementById('notifDot');
    if (!dot) return;
    if (unread > 0) { dot.textContent = unread; dot.classList.remove('hidden'); } else dot.classList.add('hidden');
  } catch (e) {}
}
async function toggleNotifs() {
  const existing = document.getElementById('notifPanel');
  if (existing) { existing.remove(); return; }
  const { notifications } = await api.get('/notifications');
  const panel = document.createElement('div');
  panel.className = 'notif-panel'; panel.id = 'notifPanel';
  panel.innerHTML = `<div style="padding:12px 16px;border-bottom:1px solid var(--line);font-weight:700">Notificaciones</div>
    ${notifications.length ? notifications.map((n) => `
      <div class="notif-item ${n.read ? '' : 'unread'}"><div>${esc(n.text)}</div>
        <div class="muted" style="font-size:11px;margin-top:3px">${fmtDateTime(n.created_at)}</div></div>`).join('') : '<div class="empty">Sin notificaciones</div>'}`;
  document.querySelector('.topbar').appendChild(panel);
  await api.post('/notifications/read');
  loadNotifs();
  setTimeout(() => document.addEventListener('click', function h(e) {
    if (!panel.contains(e.target) && e.target.id !== 'bellBtn') { panel.remove(); document.removeEventListener('click', h); }
  }), 50);
}

// ---------- Router ----------
const TITLES = {
  dashboard: 'Dashboard', clientes: 'Clientes', movimientos: 'Altas / Bajas', tareas: 'Tareas operativas',
  'tareas-hoy': 'Tareas de hoy', seguimientos: 'Bandeja de seguimientos', siniestros: 'Siniestros',
  aprobaciones: 'Centro de aprobaciones', campanas: 'Campanas', objetivos: 'Campañas',
  supervision: 'Supervision del equipo',
  marketing: 'Marketing',
  usuarios: 'Usuarios', auditoria: 'Auditoria', ranking: 'Ranking del equipo', rendimiento: 'Mi rendimiento',
  comisiones: 'Liquidacion de comisiones', 'mi-comision': 'Mi comision', metricas: 'Metricas de conversion',
  avisos: 'Avisos y circulares', papelera: 'Papelera', marketing: 'Panel de Marketing', 'banco-ideas': 'Banco de Ideas',
  biblioteca: 'Biblioteca de Marca', 'campanas-archivadas': 'Campañas archivadas', campana: 'Detalle de campaña',
};

export async function route() {
  const hash = location.hash.replace(/^#\//, '') || 'dashboard';
  const parts = hash.split('/');
  const page = parts[0];
  const content = document.getElementById('content');
  if (!content) return;

  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('active', a.dataset.route === page));
  document.getElementById('pageTitle').textContent = TITLES[page] || 'Dashboard';
  document.getElementById('sidebar')?.classList.remove('open');
  content.innerHTML = '<div class="empty">Cargando...</div>';
  clearSupervisionInterval();

  // marcar seccion como vista
  if (SEEN_SECTIONS.includes(page)) {
    try { await api.post('/sections/seen', { section: page }); } catch (e) {}
  }

  try {
    let view;
    switch (page) {
      case 'dashboard': view = await renderDashboard(); break;
      case 'ranking': view = await renderRanking(); break;
      case 'rendimiento': view = await renderMyPerformance(); break;
      case 'clientes': view = parts[1] ? await renderClientDetail(parts[1]) : await renderClients(); break;
      case 'movimientos': view = await renderMovements(); break;
      case 'tareas-hoy': view = await renderTodayTasks(); break;
      case 'tareas': view = await renderOperativeTasks(); break;
      case 'seguimientos': view = await renderFollowups(); break;
      case 'siniestros': view = parts[1] ? await renderClaimDetail(parts[1]) : await renderClaims(); break;
      case 'aprobaciones': view = await renderApprovals(); break;
      case 'supervision': view = await renderSupervision(); break;
      case 'marketing': view = await renderMarketing(); break;
      case 'banco-ideas': view = await renderBancoIdeas(); break;
      case 'biblioteca': view = await renderBrandLibrary(); break;
      case 'objetivos': view = await renderObjectives(); break;
      case 'campanas-archivadas': view = await renderObjectivesArchived(); break;
      case 'campana': view = await renderCampaignDetail(parts[1]); break;
      case 'usuarios': view = await renderUsers(); break;
      case 'auditoria': view = await renderAudit(); break;
      case 'comisiones': view = await renderCommissionsAdmin(); break;
      case 'mi-comision': view = await renderMyCommission(); break;
      case 'metricas': view = await renderMetrics(); break;
      case 'avisos': view = await renderAvisosAdmin(); break;
      case 'papelera': view = await renderTrash(); break;
      default: view = { html: '<div class="empty">Pagina no encontrada</div>' };
    }
    content.innerHTML = view.html;
    if (view.mount) view.mount(content);
    refreshDots();
  } catch (err) {
    if (err.status === 401) { state.user = null; renderLogin('Sesion finalizada. Volve a ingresar.'); return; }
    content.innerHTML = `<div class="empty">Error: ${esc(err.message)}</div>`;
  }
}

export { icons, fmtMoney, fmtDate, fmtDateTime, initials, esc, toast, openModal, badge, api };
export function go(hash) { location.hash = hash; }
// Grafico de lineas profesional en SVG (grilla, area, tooltips nativos, animacion).
function chartShort(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1) + 'M';
  if (a >= 1e3) return Math.round(v / 1e3) + 'k';
  return String(Math.round(v));
}
function chartNiceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const r = v / p;
  const nice = r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10;
  return nice * p;
}
export function lineChart(series, opts = {}) {
  const w = opts.w || 900, h = opts.h || 280;
  const padL = 50, padR = 18, padT = 14, padB = 26;
  const keys = opts.keys || [];
  const all = series.flatMap((s) => keys.map((k) => s[k.field]).filter((v) => v != null));
  const min = 0;
  const max = chartNiceMax(Math.max(1, ...all));
  const n = series.length;
  const x = (i) => padL + (n <= 1 ? (w - padL - padR) / 2 : (i * (w - padL - padR) / (n - 1)));
  const y = (v) => h - padB - ((v - min) / (max - min || 1)) * (h - padT - padB);

  let grid = '';
  const ticks = 4;
  for (let t = 0; t <= ticks; t++) {
    const val = min + (max - min) * t / ticks;
    const gy = y(val);
    grid += `<line x1="${padL}" y1="${gy.toFixed(1)}" x2="${w - padR}" y2="${gy.toFixed(1)}" stroke="#eef1f6" stroke-width="1"/>`;
    grid += `<text x="${padL - 8}" y="${(gy + 3).toFixed(1)}" font-size="10" fill="#95a5a6" text-anchor="end">${chartShort(val)}</text>`;
  }

  const defs = `<defs>${keys.map((k, ki) => `<linearGradient id="g${ki}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${k.color}" stop-opacity="0.22"/><stop offset="100%" stop-color="${k.color}" stop-opacity="0"/></linearGradient>`).join('')}</defs>`;

  const paths = keys.map((k, ki) => {
    const pts = series.map((s, i) => (s[k.field] == null ? null : [x(i), y(s[k.field])])).filter(Boolean);
    if (!pts.length) return '';
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = ki === 0 ? `<path d="${line} L${pts[pts.length - 1][0].toFixed(1)} ${h - padB} L${pts[0][0].toFixed(1)} ${h - padB} Z" fill="url(#g${ki})"/>` : '';
    const poly = `<path d="${line}" fill="none" stroke="${k.color}" stroke-width="${ki === 0 ? 2.6 : 1.8}" stroke-linecap="round" stroke-linejoin="round" class="chart-line"${ki ? ' stroke-dasharray="5 4"' : ''}/>`;
    const dots = series.map((s, i) => (s[k.field] == null ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(s[k.field]).toFixed(1)}" r="3.5" fill="#fff" stroke="${k.color}" stroke-width="2" class="chart-dot"><title>${esc(s.period)} — ${k.label}: ${chartShort(s[k.field])}</title></circle>`)).join('');
    return area + poly + dots;
  }).join('');

  const xlabels = series.map((s, i) => `<text x="${x(i).toFixed(1)}" y="${h - 8}" font-size="10" fill="#95a5a6" text-anchor="middle">${esc(s.period.slice(2))}</text>`).join('');
  const legend = keys.map((k) => `<span><i style="background:${k.color}"></i>${esc(k.label)}</span>`).join('');
  return `<div class="chart-wrap"><svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block">${defs}${grid}${paths}${xlabels}</svg></div><div class="legend">${legend}</div>`;
}
