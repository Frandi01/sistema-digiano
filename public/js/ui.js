// Helpers de UI: iconos, toasts, modales, formato y badges.

export const icons = {
  dashboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  clients: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 5.2a3 3 0 010 5.6M17 14c2.4.4 4 2.3 4 5"/></svg>',
  movements: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>',
  tasks: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12l2.2 2.2L16 9"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  followups: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></svg>',
  claims: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l8 4v5c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V7z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>',
  approvals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>',
  campaigns: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l15-6v14L3 13z"/><path d="M3 11v2a2 2 0 002 2h1"/><path d="M18 8a3 3 0 010 6"/></svg>',
  ranking: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 21h8M12 17v4"/><path d="M7 4h10v4a5 5 0 01-10 0z"/><path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.2"/><path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/></svg>',
  audit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h9l3 3v15H6z"/><path d="M9 9h6M9 13h6M9 17h4"/></svg>',
  objectives: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>',
  menu: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 5v14M5 12h14"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 4h8v4a4 4 0 01-8 0z"/><path d="M8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3M9 20h6M12 14v6"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 14l5-5 5 5"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M7 10l5 5 5-5"/></svg>',
  money: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5A2 2 0 0112 8c1.5 0 2 1 2 1.6 0 1.8-4 .9-4 2.8 0 .7.6 1.6 2 1.6a2 2 0 002.3-1.4"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13"/></svg>',
  metrics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20V4M4 20h16M8 16l4-5 3 3 5-7"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 11l15-6v14L3 13z"/><path d="M3 11v2a2 2 0 002 2h1"/><path d="M18 8a3 3 0 010 6"/></svg>',
  idea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6M10 21h4M12 3a6 6 0 00-4 10.5c.6.6 1 1.3 1 2.5h6c0-1.2.4-1.9 1-2.5A6 6 0 0012 3z"/></svg>',
};

export function fmtMoney(n) {
  return '$' + Math.round(n || 0).toLocaleString('es-AR');
}
export function fmtDate(s) {
  if (!s) return '-';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s + 'Z');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' });
}
export function fmtDateTime(s) {
  if (!s) return '-';
  const d = new Date(s + 'Z');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
export function initials(name) {
  return (name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Exportar a PDF usando la impresion del navegador (sin dependencias).
// El nombre del archivo sale del titulo del documento.
export function printPDF(filename) {
  const old = document.title;
  if (filename) document.title = filename;
  window.print();
  setTimeout(() => { document.title = old; }, 800);
}

// Encabezado profesional para reportes impresos (logo + titulo + periodo + fecha).
export function printHeader(title, period) {
  const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' });
  return `<div class="print-only" style="margin-bottom:16px;border-bottom:2px solid #1f3864;padding-bottom:10px">
    <img src="/assets/logo-negro.png" style="height:34px" />
    <div style="font-size:18px;font-weight:800;color:#1f3864;margin-top:6px">${esc(title)}</div>
    <div style="font-size:12px;color:#555">${period ? 'Periodo: ' + esc(period) + ' &middot; ' : ''}Generado: ${fecha} &middot; Digiano Asesores</div>
  </div>`;
}

// Toasts
export function toast(msg, type = '') {
  const root = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  root.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3200);
}

// Modal. Devuelve { close }. opts: {title, body(html), footer(html), wide, onMount(node)}
export function openModal(opts) {
  const root = document.getElementById('modal-root');
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal ${opts.wide ? 'wide' : ''}" role="dialog">
      <div class="modal-head"><h3>${esc(opts.title || '')}</h3><button class="close-x" data-close>&times;</button></div>
      <div class="modal-body">${opts.body || ''}</div>
      ${opts.footer ? `<div class="modal-foot">${opts.footer}</div>` : ''}
    </div>`;
  root.appendChild(bg);
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => { if (e.target === bg || e.target.hasAttribute('data-close')) close(); });
  if (opts.onMount) opts.onMount(bg.querySelector('.modal'), close);
  return { close, node: bg.querySelector('.modal') };
}

// Badge para estados de tareas / siniestros / resultados.
const BADGE_MAP = {
  pendiente: ['orange', 'Pendiente'], en_proceso: ['blue', 'En proceso'],
  completada: ['green', 'Completada'], vencida: ['red', 'Vencida'],
  aprobado: ['green', 'Aprobado'], rechazado: ['red', 'Rechazado'],
  abierto: ['orange', 'Abierto'], documentacion_pendiente: ['orange', 'Doc. pendiente'],
  presentado: ['blue', 'Presentado'], en_analisis: ['purple', 'En analisis'],
  liquidado: ['green', 'Liquidado'], cerrado: ['gray', 'Cerrado'],
  no_contactado: ['gray', 'No contactado'], no_respondio: ['orange', 'No respondio'],
  contactado: ['blue', 'Contactado'], cotizacion_enviada: ['purple', 'Cotizacion enviada'],
  venta_cerrada: ['green', 'Venta cerrada'], no_interesado: ['red', 'No interesado'],
  inviable: ['gray', 'Inviable'],
};
export function badge(status, fallback) {
  const m = BADGE_MAP[status];
  if (!m) return `<span class="badge gray">${esc(fallback || status || '-')}</span>`;
  return `<span class="badge ${m[0]}">${m[1]}</span>`;
}
