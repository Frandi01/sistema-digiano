import { api } from '../api.js';
import { icons, fmtMoney, esc, fmtDate, fmtDateTime, initials, printPDF, printHeader, openModal } from '../ui.js';
import { state, lineChart } from '../app.js';

const ACT = {
  crear_cliente: 'creo un cliente', editar_cliente: 'edito un cliente',
  movimiento_alta: 'registro un alta', movimiento_baja: 'registro una baja',
  aprobar_movimiento: 'aprobo un movimiento', rechazar_movimiento: 'rechazo un movimiento',
  crear_siniestro: 'creo un siniestro', estado_siniestro: 'actualizo un siniestro',
  novedad_siniestro: 'agrego una novedad', resultado_comercial: 'cerro una venta',
  estado_tarea: 'completo una tarea', crear_tarea: 'creo una tarea',
  cerrar_campana: 'cerro una campana', crear_campana: 'creo una campana', crear_objetivo: 'creo un objetivo',
  crear_liquidacion: 'cargo una liquidacion', estado_liquidacion: 'cambio una liquidacion',
  borrar_liquidacion: 'borro una liquidacion', crear_aviso: 'publico un aviso', crear_usuario: 'creo un usuario',
  observacion: 'cargo una observacion', solicitar_cambio: 'solicito un cambio', resolver_cambio: 'resolvio un cambio',
  borrar_tarea: 'archivo una tarea', restaurar: 'restauro un elemento', masiva_tareas: 'accion masiva',
};
const ACT_COLOR = {
  movimiento_alta: 'var(--green)', movimiento_baja: 'var(--red)',
  crear_cliente: 'var(--blue)', editar_cliente: 'var(--blue)', resolver_cambio: 'var(--blue)',
  crear_campana: 'var(--orange)', cerrar_campana: 'var(--orange)', crear_liquidacion: 'var(--orange)',
  crear_aviso: 'var(--gray)', crear_siniestro: 'var(--purple)', estado_siniestro: 'var(--purple)',
};
const roleColor = (r) => r === 'admin' ? 'var(--navy)' : r === 'siniestros' ? 'var(--purple)' : 'var(--blue)';

function delta(cur, prev, invert) {
  if (prev == null || prev === 0) return '';
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return '';
  const good = invert ? pct < 0 : pct > 0;
  return `<span class="kdelta ${good ? 'pos' : 'neg'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
}

export async function renderDashboard() {
  const d = await api.get('/dashboard');
  let avisos = []; let evolution = []; let activity = [];
  const failed = [];
  try { avisos = (await api.get('/avisos')).avisos; } catch (e) { console.warn('avisos', e); failed.push('avisos'); }
  try { evolution = (await api.get('/commissions/evolution')).series; } catch (e) { console.warn('evolution', e); failed.push('evolución de comisiones'); }
  try { activity = (await api.get('/activity')).activity; } catch (e) { console.warn('activity', e); failed.push('actividad reciente'); }

  const o = d.objective;
  const m = d.movement;
  const pv = m.prev || {};
  const k = d.kpis || { pendingTasks: 0, openClaims: 0 };
  const me = d.ranking.find((r) => r.id === state.user.id);
  const updated = new Date().toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

  // ---------- KPIs ----------
  const kpi = (ic, color, label, value, deltaHtml, sub) => `
    <div class="card kpi-mini sp3">
      <div class="row between"><span class="kpi-label">${label}</span><span class="kpi-icon" style="background:${color}1a;color:${color}">${icons[ic] || ''}</span></div>
      <div class="kpi-value">${value}${deltaHtml ? ' ' + deltaHtml : ''}</div>
      <div class="kpi-sub">${sub || ''}</div>
    </div>`;
  const kpis = `
    ${kpi('objectives', '#2e75b6', 'Campaña del mes', (o ? o.progress : 0) + '%', '', o ? `${o.done}/${o.target} altas` : 'sin campaña')}
    ${kpi('up', '#27ae60', 'Altas del mes', m.altas, delta(m.altas, pv.altas), m.topBranch ? 'Top: ' + m.topBranch : '')}
    ${kpi('down', '#e74c3c', 'Bajas del mes', m.bajas, delta(m.bajas, pv.bajas, true), '')}
    ${kpi('movements', '#2e75b6', 'Crecimiento neto', (m.net >= 0 ? '+' : '') + m.net, '', 'altas - bajas')}
    ${kpi('money', '#e67e22', 'Comisión generada', fmtMoney(m.commission), delta(m.commission, pv.commission), 'este mes')}
    ${kpi('money', '#8e44ad', 'Comisión proyectada', fmtMoney(o ? o.commissionProjected : 0), '', 'fin de mes')}
    ${kpi('tasks', '#2e75b6', 'Tareas pendientes', k.pendingTasks, '', 'del equipo')}
    ${kpi('claims', '#e67e22', 'Siniestros abiertos', k.openClaims, '', 'en gestión')}`;

  // ---------- Campaña (hero) ----------
  const objCard = o ? `
    <div class="card pad obj-hero sp5">
      <div class="row between" style="margin-bottom:10px">
        <div><div class="kpi-label">Campaña actual</div>
          <h2 style="font-size:18px;margin-top:2px">${esc(o.name)} ${o.branch ? `<span class="badge blue">${esc(o.branch)}</span>` : ''}</h2></div>
        ${d.activeObjectives > 1 ? `<span class="badge navy" title="Campañas activas">+${d.activeObjectives - 1} campañas mas</span>` : ''}
      </div>
      <div class="obj-body">
        <div class="obj-pct">${o.progress}<small>%</small></div>
        <div class="obj-stats">
          <div><b>${o.done}/${o.target}</b><span>altas</span></div>
          <div><b>${o.remaining}</b><span>restantes</span></div>
          <div><b>${o.daysLeft}</b><span>dias</span></div>
          <div><b>${fmtMoney(o.commissionMonth)}</b><span>comisión</span></div>
        </div>
      </div>
      <div class="progress big" style="margin-top:14px"><span style="width:${o.progress}%"></span></div>
      <div class="muted" style="font-size:12px;margin-top:7px">${o.progress}% completado &middot; proyección comisión ${fmtMoney(o.commissionProjected)}</div>
    </div>` : `<div class="card pad sp5"><div class="kpi-label">Sin campaña activa</div><h2 style="font-size:18px">Crea una campaña del mes</h2>${state.user.role === 'admin' ? '<a class="btn" href="#/objetivos" style="margin-top:10px">Crear campaña</a>' : ''}</div>`;

  // ---------- Evolucion ----------
  const evoCard = `
    <div class="card pad sp7">
      <div class="row between" style="margin-bottom:4px"><h3 class="card-title">Evolucion de la cartera</h3>
        <span class="muted" style="font-size:12px">comisión computable (sin aguinaldo)</span></div>
      ${evolution.length >= 2 ? lineChart(evolution, { keys: [
        { field: 'computable', color: '#2e75b6', label: 'Computable' },
        ...(state.user.role === 'admin' ? [{ field: 'real_cobrada', color: '#27ae60', label: 'Total recibido' }] : []),
      ] }) : '<div class="empty">Carga al menos 2 periodos en Comisiones para ver la curva.</div>'}
    </div>`;

  // ---------- Avisos ----------
  const avisosCard = `
    <div class="card pad dash-box sp4">
      <div class="box-head"><h3 class="card-title">Avisos</h3>${avisos.some((a) => !a.leido) ? '<span class="badge red">nuevos</span>' : ''}</div>
      <div class="box-body">${avisos.length ? avisos.map((a) => `
        <div class="aviso-row ${a.leido ? '' : 'unread'}" data-aviso="${a.id}">
          <span class="prio-dot ${a.priority}"></span>
          <div class="aviso-main">
            <div class="aviso-title">${esc(a.title)}${a.leido ? '' : ' <span class="badge blue">nuevo</span>'}</div>
            ${a.body ? `<div class="aviso-prev">${esc(a.body)}</div>` : ''}
            <div class="aviso-meta">${fmtDateTime(a.created_at)} &middot; ${esc(a.author || 'Admin')}</div>
          </div>
        </div>`).join('') : '<div class="empty">No hay avisos nuevos.</div>'}</div>
    </div>`;

  // ---------- Actividad ----------
  const recent = activity.slice(0, 7);
  const actCard = `
    <div class="card pad dash-box sp4">
      <div class="box-head"><h3 class="card-title">Actividad reciente</h3>${state.user.role === 'admin' ? '<a href="#/auditoria" class="link-sm">Ver todo</a>' : ''}</div>
      <div class="box-body">${recent.length ? recent.map((a) => `
        <div class="act-row">
          <span class="act-dot" style="background:${ACT_COLOR[a.action] || 'var(--blue)'}"></span>
          <div class="mini-avatar">${initials(a.user_name || 'S')}</div>
          <div class="act-main">
            <div class="act-text"><b>${esc(a.user_name || 'Sistema')}</b> ${esc(ACT[a.action] || a.action.replace(/_/g, ' '))}${a.detail ? ` <span class="muted">— ${esc(a.detail)}</span>` : ''}</div>
            <div class="act-time">${fmtDateTime(a.created_at)}</div>
          </div>
        </div>`).join('') : '<div class="empty">Todavía no hay actividad reciente.</div>'}</div>
    </div>`;

  // ---------- Ranking ----------
  const medal = (p) => p === 1 ? 'gold' : p === 2 ? 'silver' : p === 3 ? 'bronze' : '';
  const rankCard = `
    <div class="card pad sp4">
      <div class="box-head"><h3 class="card-title">Ranking del equipo</h3>${me ? `<span class="badge navy">#${me.position}</span>` : ''}</div>
      <div style="margin-top:6px">${d.ranking.map((r) => `
        <div class="rank-row ${r.position === 1 ? 'first' : ''} ${r.id === state.user.id ? 'mine' : ''}">
          <div class="rank-pos ${medal(r.position)}">${r.position === 1 ? '🏆' : r.position}</div>
          <div class="mini-avatar lg" style="background:${roleColor(r.role)}">${initials(r.name)}</div>
          <div class="rank-info">
            <div class="row between"><b>${esc(r.name)}</b><span class="rank-pts">${r.score} pts</span></div>
            <div class="progress" style="margin-top:5px"><span style="width:${r.progress}%"></span></div>
            <div class="rank-sub">${r.assigned > 0 ? `${r.completed}/${r.assigned} tareas &middot; ${r.progress}% cumplimiento` : 'Sin tareas asignadas en el período'}</div>
          </div>
        </div>`).join('')}</div>
    </div>`;

  const failBanner = failed.length
    ? `<div class="empty no-print" style="color:#c0392b;text-align:left;margin-bottom:14px">No se pudieron cargar: ${failed.join(', ')}. El resto del panel sí cargó; reintentá para ver esas secciones.</div>`
    : '';
  const html = `
    ${printHeader('Dashboard General', o ? o.name : '')}
    ${failBanner}
    <div class="row between no-print" style="margin-bottom:16px">
      <div><h2 style="font-size:20px">Dashboard General</h2>
        <div class="muted" style="font-size:12px">Última actualización: ${updated}</div></div>
      <button class="btn ghost sm" id="pdfDash">Exportar PDF</button>
    </div>
    <div class="dash-grid">
      ${kpis}
      ${objCard}
      ${evoCard}
      ${avisosCard}
      ${actCard}
      ${rankCard}
    </div>`;

  return {
    html,
    mount: (root) => {
      avisos.filter((a) => !a.leido).forEach(() => {});
      const pb = root.querySelector('#pdfDash');
      if (pb) pb.onclick = () => printPDF('Dashboard_General_Digiano_Asesores');
      root.querySelectorAll('[data-aviso]').forEach((el) => el.onclick = () => {
        const a = avisos.find((x) => x.id == el.dataset.aviso);
        if (!a) return;
        api.post('/avisos/' + a.id + '/read').catch(() => {});
        el.classList.remove('unread');
        openModal({
          title: a.title,
          body: `<div class="muted" style="font-size:12px;margin-bottom:10px">${fmtDateTime(a.created_at)} &middot; ${esc(a.author || 'Admin')} &middot; prioridad ${esc(a.priority)}</div>
                 <div style="white-space:pre-wrap;font-size:14px;line-height:1.6">${esc(a.body || '(sin contenido)')}</div>`,
          footer: '<button class="btn" data-close>Cerrar</button>',
        });
      });
    },
  };
}
