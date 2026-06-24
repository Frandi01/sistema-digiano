import { api } from '../api.js';
import { icons, esc, fmtMoney, fmtDate, fmtDateTime, toast, openModal, badge, initials, printPDF, printHeader, emptyState } from '../ui.js';
import { state } from '../app.js';

const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

/* ============ APROBACIONES ============ */
export async function renderApprovals() {
  const d = await api.get('/approvals');
  let changes = [];
  try { changes = (await api.get('/change-requests')).requests; } catch (e) { console.warn('change-requests', e); }

  const movRows = d.movements.map((m) => `
    <tr><td>${m.type === 'alta' ? '<span class="badge green">Alta</span>' : '<span class="badge red">Baja</span>'}</td>
      <td><b>${esc(m.client_name)}</b></td><td>${esc(m.branch)}</td><td>${esc(m.created_name || '-')}</td><td>${fmtMoney(m.commission)}</td>
      <td><button class="btn green sm" data-app-mov="${m.id}" aria-label="Aprobar movimiento de ${esc(m.client_name)}">Aprobar</button> <button class="btn outline sm" data-rej-mov="${m.id}" aria-label="Rechazar movimiento de ${esc(m.client_name)}">Rechazar</button></td></tr>`).join('');
  const cliRows = d.clients.map((c) => `
    <tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone || '-')}</td><td>${esc(c.created_name || '-')}</td>
    <td><button class="btn green sm" data-app-cli="${c.id}" aria-label="Aprobar cliente ${esc(c.name)}">Aprobar cliente</button></td></tr>`).join('');
  const chRows = changes.map((c) => `
    <tr><td><b>${esc(c.summary || c.type)}</b></td><td>${esc(c.client_name || '-')}</td><td>${esc(c.requested_name || '-')}</td>
    <td><button class="btn green sm" data-app-ch="${c.id}" aria-label="Aprobar cambio">Aprobar</button> <button class="btn outline sm" data-rej-ch="${c.id}" aria-label="Rechazar cambio">Rechazar</button></td></tr>`).join('');

  const block = (title, head, rows, cols) => `
    <div class="card table-card" style="margin-bottom:18px"><div class="table-head"><h3 style="font-size:15px">${title}</h3></div>
      <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${cols}"><div class="empty">No hay nada pendiente.</div></td></tr>`}</tbody></table></div>`;

  const html =
    block('Movimientos pendientes', ['Tipo', 'Cliente', 'Ramo', 'Cargado por', 'Comisión', ''], movRows, 6) +
    block('Cambios de datos pendientes', ['Cambio', 'Cliente', 'Solicitado por', ''], chRows, 4) +
    block('Clientes nuevos por aprobar', ['Cliente', 'Teléfono', 'Creado por', ''], cliRows, 4);

  return {
    html,
    mount: (root) => {
      const act = (sel, confirmMsg, fn) => root.querySelectorAll(sel).forEach((b) => b.onclick = async () => {
        if (confirmMsg && !confirm(confirmMsg)) return;
        try { await fn(b); refresh(); } catch (e) { toast(e.message, 'red'); }
      });
      act('[data-app-mov]', '¿Aprobar este movimiento? Se aplicará al cliente y a la cartera.', async (b) => { await api.post('/movements/' + b.dataset.appMov + '/approve'); toast('Aprobado', 'green'); });
      act('[data-rej-mov]', '¿Rechazar este movimiento? No se aplicará ningún cambio.', async (b) => { const reason = prompt('Motivo del rechazo (opcional):') || 'Rechazado por admin'; await api.post('/movements/' + b.dataset.rejMov + '/reject', { reason }); toast('Rechazado'); });
      act('[data-app-cli]', '¿Aprobar este cliente nuevo? Pasará a la cartera activa.', async (b) => { await api.post('/clients/' + b.dataset.appCli + '/approve'); toast('Cliente aprobado', 'green'); });
      act('[data-app-ch]', '¿Aprobar este cambio de datos? Se aplicará al cliente.', async (b) => { await api.post('/change-requests/' + b.dataset.appCh + '/resolve', { decision: 'aprobar' }); toast('Cambio aprobado', 'green'); });
      act('[data-rej-ch]', '¿Rechazar este cambio? No se aplicará.', async (b) => { await api.post('/change-requests/' + b.dataset.rejCh + '/resolve', { decision: 'rechazar' }); toast('Cambio rechazado'); });
    },
  };
}

/* ============ OBJETIVOS ============ */
const ADMIN_TASKS = ['Disenar folleto', 'Preparar material grafico', 'Imprimir folleteria', 'Comprar insumos', 'Preparar stand', 'Coordinar material de campaña'];

export async function renderObjectives(archived = false) {
  const { objectives } = await api.get('/objectives' + (archived ? '?archived=1' : ''));
  const prio = (p) => `<span class="badge ${p === 'alta' ? 'red' : p === 'baja' ? 'gray' : 'orange'}">${esc(p || 'media')}</span>`;
  const areas = (o) => [o.part_comercial ? '<span class="badge blue">Comercial</span>' : '', o.part_marketing ? '<span class="badge purple">Marketing</span>' : '', o.part_admin ? '<span class="badge navy">Admin</span>' : ''].filter(Boolean).join(' ') || '<span class="muted">-</span>';
  const rows = objectives.map((o) => `
    <tr><td style="text-align:center"><input type="checkbox" class="cmpChk" value="${o.id}"></td>
      <td><a href="#/campana/${o.id}" style="font-weight:600">${esc(o.name)}</a> ${o.active ? '<span class="badge green">Activa</span>' : '<span class="badge gray">Inactiva</span>'}</td>
      <td>${o.type === 'marketing' ? '<span class="badge purple">Marketing</span>' : '<span class="badge blue">Comercial</span>'}</td>
      <td>${areas(o)}</td>
      <td>${esc(o.branch || '-')}</td><td>${prio(o.priority)}</td>
      <td>${fmtDate(o.start_date)} - ${fmtDate(o.end_date)}</td>
      <td class="row" style="gap:5px;flex-wrap:wrap">
        <button class="btn outline sm" data-view="${o.id}">Ver</button>
        <button class="btn outline sm" data-edit="${o.id}">Editar</button>
        <button class="btn outline sm" data-dup="${o.id}">Duplicar</button>
        ${archived ? `<button class="btn outline sm" data-restore="${o.id}">Restaurar</button>` : `<button class="btn outline sm" data-arch="${o.id}">Archivar</button>`}
        <button class="btn outline sm" data-del="${o.id}">Borrar</button>
      </td></tr>`).join('');
  const html = `
    <div class="card pad" style="margin-bottom:14px"><div class="muted" style="font-size:13px">Las <b>campañas</b> son el motor del sistema: conectan Comercial, Marketing y Administración. Tocá el nombre para ver el detalle unificado (comercial + marketing + timeline).</div></div>
    <div class="card table-card"><div class="table-head between"><h3 style="font-size:15px">${archived ? 'Campañas archivadas' : 'Campañas'}</h3>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button class="btn outline" id="cmpBtn">Comparar seleccionadas</button>
        <a class="btn outline" href="#/${archived ? 'objetivos' : 'campanas-archivadas'}">${archived ? 'Ver activas' : 'Ver archivadas'}</a>
        ${archived ? '' : `<button class="btn" id="newObj">${icons.plus} Nueva campaña</button>`}
      </div></div>
      <table><thead><tr><th></th><th>Nombre</th><th>Tipo</th><th>Areas</th><th>Ramo</th><th>Prioridad</th><th>Periodo</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="8"><div class="empty">Todavía no hay campañas creadas.</div></td></tr>'}</tbody></table></div>`;
  return {
    html,
    mount: (root) => {
      const nb = root.querySelector('#newObj'); if (nb) nb.onclick = () => objForm();
      root.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { location.hash = '#/campana/' + b.dataset.view; });
      root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => objForm(objectives.find((o) => o.id == b.dataset.edit)));
      root.querySelectorAll('[data-dup]').forEach((b) => b.onclick = async () => { try { await api.post('/objectives/' + b.dataset.dup + '/duplicate'); toast('Campaña duplicada', 'green'); refresh(); } catch (e) { toast(e.message, 'red'); } });
      root.querySelectorAll('[data-arch]').forEach((b) => b.onclick = async () => { if (confirm('Archivar esta campaña?')) { await api.post('/objectives/' + b.dataset.arch + '/archive'); toast('Archivada'); refresh(); } });
      root.querySelectorAll('[data-restore]').forEach((b) => b.onclick = async () => { await api.post('/objectives/' + b.dataset.restore + '/restore'); toast('Restaurada', 'green'); refresh(); });
      root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Mover campaña a la papelera?')) { await api.del('/objectives/' + b.dataset.del); toast('A la papelera'); refresh(); } });
      root.querySelector('#cmpBtn').onclick = () => {
        const ids = Array.from(root.querySelectorAll('.cmpChk:checked')).map((c) => c.value);
        if (ids.length < 2) return toast('Elegi al menos 2 campañas para comparar', 'red');
        openCompare(ids);
      };
    },
  };
}

export async function renderObjectivesArchived() { return renderObjectives(true); }

async function openCompare(ids) {
  let d; try { d = await api.get('/objectives/compare?ids=' + ids.join(',')); } catch (e) { return toast(e.message, 'red'); }
  const cols = d.campaigns.map((c) => `<th>${esc(c.name)}</th>`).join('');
  const row = (label, key) => `<tr><td><b>${label}</b></td>${d.campaigns.map((c) => `<td>${c[key] ?? 0}</td>`).join('')}</tr>`;
  openModal({
    title: 'Comparador de campañas', wide: true,
    body: `<div style="overflow:auto"><table style="width:100%"><thead><tr><th>Metrica</th>${cols}</tr></thead><tbody>
      ${row('Tipo', 'type')}
      ${row('Meta', 'target')}
      ${row('Ventas (comercial)', 'ventas')}
      ${row('Tareas comerciales', 'tareas_com')}
      ${row('Contenidos', 'contenidos')}
      ${row('Publicados', 'publicados')}
      ${row('Visualizaciones', 'views')}
      ${row('Alcance', 'reach')}
    </tbody></table></div>`,
    footer: '<button class="btn" data-close>Cerrar</button>',
  });
}

export async function renderCampaignDetail(id) {
  let d; try { d = await api.get('/objectives/' + id + '/detail'); } catch (e) { return { html: `<div class="empty">${esc(e.message)}</div>` }; }
  const o = d.objective, com = d.comercial || {}, pub = d.published || {};
  const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
  const cmap = {}; (d.content || []).forEach((c) => cmap[c.status] = c.n);
  const ventas = com.ventas || 0, totalT = com.total || 0;
  const resumen = `Campaña "${o.name}" (${o.type === 'marketing' ? 'Marketing' : 'Comercial'}). ` +
    `Comercial: ${ventas} ventas sobre ${totalT} tareas` + (o.target ? `, ${pct(ventas, o.target)}% de la meta (${o.target})` : '') + `. ` +
    `Marketing: ${pub.n || 0} publicaciones, ${pub.views || 0} visualizaciones, ${pub.likes || 0} likes.`;
  const kpi = (label, val, color) => `<div class="card pad" style="flex:1;text-align:center;min-width:96px"><div style="font-size:20px;font-weight:700;color:${color || 'var(--navy)'}">${val ?? 0}</div><div class="muted" style="font-size:11px">${label}</div></div>`;
  const STLAB = { idea: 'Idea', guion: 'Guión', pend_grabar: 'Pend. grabar', grabado: 'Grabado', editando: 'Editando', revision: 'Revisión', programado: 'Programado', publicado: 'Publicado', pendiente_metricas: 'Pend. métricas' };
  const contentRows = Object.keys(cmap).map((k) => `<span class="badge gray" style="margin:2px">${STLAB[k] || k}: ${cmap[k]}</span>`).join('') || '<span class="muted">Sin contenido</span>';
  const tl = (d.timeline || []).map((e) => `<div style="padding:6px 0;border-bottom:1px solid var(--border)"><span class="muted" style="font-size:11px">${fmtDateTime(e.created_at)}</span> &middot; ${esc(e.user_name || 'Sistema')} &middot; <b>${esc(e.action)}</b>${e.detail ? ' &mdash; ' + esc(e.detail) : ''}</div>`).join('') || '<div class="muted">Sin actividad registrada</div>';
  const html = `
    <div class="row between wrap" style="margin-bottom:12px">
      <a class="btn outline sm" href="#/objetivos">&larr; Campañas</a>
      ${o.active ? '<span class="badge green">Activa</span>' : '<span class="badge gray">Inactiva</span>'}
    </div>
    <div class="card pad" style="margin-bottom:14px">
      <h2 style="font-size:18px;margin-bottom:4px">${esc(o.name)}</h2>
      <div class="muted" style="font-size:13px">${o.type === 'marketing' ? 'Marketing' : 'Comercial'} &middot; Ramo: ${esc(o.branch || '-')} &middot; ${fmtDate(o.start_date)} a ${fmtDate(o.end_date)}</div>
      <div style="margin-top:10px;padding:10px;background:var(--bg, #f5f7fa);border-radius:8px;font-size:13.5px">${esc(resumen)}</div>
    </div>
    <div class="card pad" style="margin-bottom:14px" id="aiCard">
      <div class="row between wrap" style="gap:8px">
        <h3 style="font-size:14px">Análisis con IA</h3>
        <button class="btn outline sm" id="aiBtn">Analizar con IA</button>
      </div>
      <div id="aiOut" class="muted" style="font-size:13px;margin-top:8px">Genera un analisis automatico de esta campaña: resumen, riesgos y recomendaciones.</div>
    </div>
    <div class="card pad" style="margin-bottom:14px">
      <h3 style="font-size:14px;margin-bottom:8px">Comercial</h3>
      <div class="row wrap" style="gap:10px">
        ${kpi('Meta', o.target, '#1f3864')}
        ${kpi('Ventas', ventas, '#27ae60')}
        ${kpi('Cotizaciones', com.cotizaciones, '#2e75b6')}
        ${kpi('Contactados', com.contactados, '#2e75b6')}
        ${kpi('Tareas', totalT)}
      </div>
    </div>
    <div class="card pad" style="margin-bottom:14px">
      <h3 style="font-size:14px;margin-bottom:8px">Marketing</h3>
      <div class="row wrap" style="gap:10px;margin-bottom:10px">
        ${kpi('Publicados', pub.n, '#27ae60')}
        ${kpi('Visualizaciones', pub.views, '#2e75b6')}
        ${kpi('Alcance', pub.reach, '#2e75b6')}
        ${kpi('Likes', pub.likes, '#8e44ad')}
        ${kpi('Comentarios', pub.comments, '#8e44ad')}
      </div>
      <div>${contentRows}</div>
    </div>
    <div class="card pad">
      <h3 style="font-size:14px;margin-bottom:8px">Timeline de la campaña</h3>
      ${tl}
    </div>`;
  return {
    html,
    mount: (root) => {
      const btn = root.querySelector('#aiBtn'), out = root.querySelector('#aiOut');
      if (!btn) return;
      btn.onclick = async () => {
        btn.disabled = true; out.textContent = 'Analizando...';
        try {
          const r = await api.post('/ai/campaign-summary/' + id);
          if (r.ok) out.innerHTML = '<div style="color:var(--text);white-space:pre-wrap">' + esc(r.analysis) + '</div>';
          else out.innerHTML = '<span style="color:#c0392b">' + esc(r.message) + '</span>';
        } catch (e) { out.innerHTML = '<span style="color:#c0392b">' + esc(e.message) + '</span>'; }
        btn.disabled = false;
      };
    },
  };
}

function objForm(o) {
  const e = o || {};
  const isMkt = e.type === 'marketing';
  openModal({
    title: o ? 'Editar campaña' : 'Nueva campaña', wide: true,
    body: `<form id="f">
      <div class="form-grid">
        <div class="field full"><label>Nombre de la campaña *</label><input name="name" value="${esc(e.name || '')}" required /></div>
        <div class="field"><label>Tipo de campaña</label><select id="cType"><option value="comercial" ${!isMkt ? 'selected' : ''}>Comercial</option><option value="marketing" ${isMkt ? 'selected' : ''}>Marketing</option></select></div>
      </div>
      <div id="comBox"><div class="form-grid">
        <div class="field"><label>Ramo objetivo</label><select name="branch"><option value="">Todos (solo medir)</option>${state.branches.map((b) => `<option ${b === e.branch ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
        <div class="field"><label>Meta de altas</label><input name="target" type="number" value="${e.target ?? 10}" /></div>
        <div class="field"><label>Prioridad</label><select name="priority"><option value="alta" ${e.priority === 'alta' ? 'selected' : ''}>Alta</option><option value="media" ${(e.priority || 'media') === 'media' ? 'selected' : ''}>Media</option><option value="baja" ${e.priority === 'baja' ? 'selected' : ''}>Baja</option></select></div>
      </div></div>
      <div class="form-grid">
        <div class="field"><label>Inicio *</label><input name="start_date" type="date" value="${e.start_date || ''}" /></div>
        <div class="field"><label>Fin *</label><input name="end_date" type="date" value="${e.end_date || ''}" /></div>
      </div>
      <div id="areasBox" style="margin-top:12px">
        <label class="muted" style="font-size:12px;font-weight:600;text-transform:uppercase">Areas que participan</label>
        <div class="row wrap" style="gap:16px;margin-top:6px;font-size:13.5px">
          <label><input type="checkbox" id="aMkt" ${e.part_marketing ? 'checked' : ''}> Marketing (Juliana)</label>
          <label><input type="checkbox" id="aAdm" ${e.part_admin ? 'checked' : ''}> Administración (Natalia)</label>
        </div>
      </div>
      <div id="mktBox" style="margin-top:12px;display:none">
        <label class="muted" style="font-size:12px;font-weight:600;text-transform:uppercase">Contenido semanal (tareas de Juliana)</label>
        <div class="muted" style="font-size:12px;margin:2px 0 6px">Se generan cada semana mientras la campaña este activa.</div>
        <div class="form-grid">
          <div class="field"><label>Reels</label><input name="qty_reel" type="number" min="0" value="${e.qty_reel ?? 0}" /></div>
          <div class="field"><label>Carruseles</label><input name="qty_carrusel" type="number" min="0" value="${e.qty_carrusel ?? 0}" /></div>
          <div class="field"><label>Historias</label><input name="qty_historia" type="number" min="0" value="${e.qty_historia ?? 0}" /></div>
          <div class="field"><label>Posts LinkedIn</label><input name="qty_linkedin" type="number" min="0" value="${e.qty_linkedin ?? 0}" /></div>
        </div>
      </div>
      <div id="admBox" style="margin-top:12px;display:none">
        <label class="muted" style="font-size:12px;font-weight:600;text-transform:uppercase">Tareas para Administración (Natalia)</label>
        <div class="row wrap" style="gap:12px;margin-top:6px;font-size:13.5px">
          ${ADMIN_TASKS.map((t) => `<label><input type="checkbox" class="admT" value="${esc(t)}"> ${esc(t)}</label>`).join('')}
        </div>
      </div>
    </form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="s">Guardar campaña</button>',
    onMount: (modal, close) => {
      const type = modal.querySelector('#cType');
      const aMkt = modal.querySelector('#aMkt'), aAdm = modal.querySelector('#aAdm');
      const sync = () => {
        const mkt = type.value === 'marketing';
        modal.querySelector('#comBox').style.display = mkt ? 'none' : 'block';
        modal.querySelector('#areasBox').style.display = mkt ? 'none' : 'block';
        modal.querySelector('#mktBox').style.display = (mkt || aMkt.checked) ? 'block' : 'none';
        modal.querySelector('#admBox').style.display = (!mkt && aAdm.checked) ? 'block' : 'none';
      };
      [type, aMkt, aAdm].forEach((el) => el.addEventListener('change', sync));
      sync();
      modal.querySelector('#s').addEventListener('click', async () => {
        const g = (n) => modal.querySelector(`[name="${n}"]`) ? modal.querySelector(`[name="${n}"]`).value : '';
        const mkt = type.value === 'marketing';
        const body = {
          name: g('name'), type: type.value, start_date: g('start_date'), end_date: g('end_date'),
          branch: g('branch') || null, target: g('target'), priority: g('priority'),
          part_marketing: mkt ? 1 : (aMkt.checked ? 1 : 0),
          part_admin: mkt ? 0 : (aAdm.checked ? 1 : 0),
          qty_reel: g('qty_reel'), qty_carrusel: g('qty_carrusel'), qty_historia: g('qty_historia'), qty_linkedin: g('qty_linkedin'),
          admin_tasks: Array.from(modal.querySelectorAll('.admT:checked')).map((c) => c.value),
        };
        if (!body.name) return toast('Falta el nombre', 'red');
        if (!body.start_date || !body.end_date) return toast('Indica inicio y fin', 'red');
        try {
          if (o) await api.put('/objectives/' + o.id, body); else await api.post('/objectives', body);
          toast('Campaña guardada', 'green'); close(); refresh();
        } catch (er) { toast(er.message, 'red'); }
      });
    },
  });
}

/* ============ CAMPANAS ============ */
export async function renderCampaigns() {
  const { campaigns } = await api.get('/campaigns');
  const { opportunities } = await api.get('/opportunities');
  const byBranch = {};
  opportunities.forEach((o) => byBranch[o.offer] = (byBranch[o.offer] || 0) + 1);
  const rows = campaigns.map((c) => `
    <tr><td><b>${esc(c.name)}</b> ${c.active ? '<span class="badge green">Activa</span>' : '<span class="badge gray">Cerrada</span>'} <span class="badge ${c.priority === 'alta' ? 'red' : c.priority === 'baja' ? 'gray' : 'orange'}">${esc(c.priority || 'media')}</span></td>
      <td>${esc(c.target_product || c.branch || '-')}</td><td>${c.goal}</td>
      <td><span class="badge orange">${byBranch[c.target_product] || 0} objetivo</span></td>
      <td class="row" style="gap:6px"><button class="btn outline sm" data-edit="${c.id}">Editar</button>${c.active ? `<button class="btn outline sm" data-close-c="${c.id}">Cerrar</button>` : ''}<button class="btn outline sm" data-del="${c.id}">Borrar</button></td></tr>`).join('');
  const oppList = Object.entries(byBranch).map(([b, n]) => `<span class="chip">${esc(b)}: ${n}</span>`).join(' ');
  const html = `
    <div class="card pad" style="margin-bottom:16px"><h3 style="font-size:14px;margin-bottom:8px">Oportunidades detectadas (CRM)</h3>
      <div class="muted" style="font-size:13px;margin-bottom:8px">Clientes con productos faltantes:</div>${oppList || '<span class="muted">Sin oportunidades</span>'}</div>
    <div class="card table-card"><div class="table-head between"><h3 style="font-size:15px">Campañas</h3><button class="btn" id="newCamp">${icons.plus} Nueva campaña</button></div>
      <table><thead><tr><th>Nombre</th><th>Producto</th><th>Meta</th><th>Potencial</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5"><div class="empty">Sin campanas</div></td></tr>'}</tbody></table></div>`;
  return {
    html,
    mount: (root) => {
      root.querySelector('#newCamp').onclick = () => campForm();
      root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => campForm(campaigns.find((c) => c.id == b.dataset.edit)));
      root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Mover campana a la papelera?')) { await api.del('/campaigns/' + b.dataset.del); toast('A la papelera'); refresh(); } });
      root.querySelectorAll('[data-close-c]').forEach((b) => b.onclick = async () => { await api.post('/campaigns/' + b.dataset.closeC + '/close'); toast('Campana cerrada'); refresh(); });
    },
  };
}
function campForm(c) {
  const e = c || {};
  openModal({
    title: c ? 'Editar campana' : 'Nueva campana',
    body: `<form id="f"><div class="form-grid">
      <div class="field full"><label>Nombre *</label><input name="name" value="${esc(e.name || '')}" placeholder="30 Hogares Junio" required /></div>
      <div class="field"><label>Producto / ramo objetivo</label><select name="target_product">${state.branches.map((b) => `<option ${b === e.target_product ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <div class="field"><label>Contactos objetivo</label><input name="goal" type="number" value="${e.goal ?? 30}" /></div>
      <div class="field"><label>Prioridad</label><select name="priority"><option value="alta" ${e.priority === 'alta' ? 'selected' : ''}>Alta</option><option value="media" ${(e.priority || 'media') === 'media' ? 'selected' : ''}>Media</option><option value="baja" ${e.priority === 'baja' ? 'selected' : ''}>Baja</option></select></div>
      <div class="field"><label>Inicio</label><input name="start_date" type="date" value="${e.start_date || ''}" /></div>
      <div class="field"><label>Fin</label><input name="end_date" type="date" value="${e.end_date || ''}" /></div>
    </div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="s">Guardar</button>',
    onMount: (modal, close) => modal.querySelector('#s').onclick = async () => {
      const f = Object.fromEntries(new FormData(modal.querySelector('#f')).entries());
      try { if (c) await api.put('/campaigns/' + c.id, f); else await api.post('/campaigns', f); toast('Guardado', 'green'); close(); refresh(); }
      catch (er) { toast(er.message, 'red'); }
    },
  });
}

/* ============ USUARIOS ============ */
export async function renderUsers() {
  const { users } = await api.get('/users');
  const rows = users.map((u) => `
    <tr><td><div class="row" style="gap:10px"><div class="avatar" style="width:30px;height:30px;font-size:11px;background:${u.role === 'admin' ? 'var(--navy)' : u.role === 'siniestros' ? 'var(--purple)' : 'var(--blue)'}">${initials(u.name)}</div><b>${esc(u.name)}</b></div></td>
      <td>${esc(u.username || '-')}</td><td><span class="badge navy">${esc(u.role)}</span></td>
      <td>${u.active ? '<span class="badge green">Activo</span>' : '<span class="badge gray">Inactivo</span>'}</td>
      <td class="muted">${u.last_login ? fmtDateTime(u.last_login) : 'nunca'}</td>
      <td><button class="btn outline sm" data-reset="${u.id}" data-name="${esc(u.name)}" aria-label="Resetear contraseña de ${esc(u.name)}">Reset pass</button> <button class="btn outline sm" data-toggle="${u.id}" data-active="${u.active}" data-name="${esc(u.name)}" aria-label="${u.active ? 'Desactivar' : 'Activar'} a ${esc(u.name)}">${u.active ? 'Desactivar' : 'Activar'}</button> <button class="btn outline sm red" data-reset-score="${u.id}" data-name="${esc(u.name)}" aria-label="Resetear puntos de ${esc(u.name)}">Reset puntos</button></td></tr>`).join('');
  const html = `
    <div class="card table-card"><div class="table-head between"><h3 style="font-size:15px">Usuarios del sistema</h3><button class="btn" id="newUser">${icons.plus} Nuevo usuario</button></div>
      <table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Último ingreso</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="6"><div class="empty">Todavía no hay usuarios.</div></td></tr>`}</tbody></table></div>`;
  return {
    html,
    mount: (root) => {
      root.querySelector('#newUser').onclick = () => openModal({
        title: 'Nuevo usuario',
        body: `<form id="uForm"><div class="form-grid">
          <div class="field full"><label>Nombre *</label><input name="name" required /></div>
          <div class="field"><label>Usuario *</label><input name="username" placeholder="ej. mariap" required /></div>
          <div class="field"><label>Rol *</label><select name="role"><option value="comercial">Comercial</option><option value="siniestros">Siniestros</option><option value="marketing">Marketing</option><option value="admin">Administrador</option></select></div>
          <div class="field"><label>Email (opcional)</label><input name="email" type="email" /></div>
          <div class="field"><label>Contraseña temporal *</label><input name="password" type="password" autocomplete="new-password" required minlength="8" /></div>
          <div class="field"><label>Repetir contraseña *</label><input name="password2" type="password" autocomplete="new-password" required /></div>
        </div><div class="muted" style="font-size:12px">Mínimo 8 caracteres, con letras y números. El usuario deberá cambiarla en su primer ingreso. Comunicásela por un canal seguro.</div></form>`,
        footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="s">Crear usuario</button>',
        onMount: (modal, close) => modal.querySelector('#s').onclick = async () => {
          const f = Object.fromEntries(new FormData(modal.querySelector('#uForm')).entries());
          if (!f.name || !f.username || !f.role) return toast('Completá nombre, usuario y rol.', 'red');
          if (!f.password || f.password.length < 8) return toast('La contraseña temporal debe tener al menos 8 caracteres.', 'red');
          if (!/[A-Za-z]/.test(f.password) || !/[0-9]/.test(f.password)) return toast('La contraseña debe incluir letras y números.', 'red');
          if (f.password !== f.password2) return toast('Las contraseñas no coinciden.', 'red');
          delete f.password2;
          try { await api.post('/users', f); toast('Usuario creado. Comunicale la contraseña temporal; deberá cambiarla al ingresar.', 'green'); close(); refresh(); }
          catch (e) { toast(e.message, 'red'); }
        },
      });
      root.querySelectorAll('[data-reset]').forEach((b) => b.onclick = () => resetPasswordModal(b.dataset.reset, b.dataset.name, refresh));
      root.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => {
        const desactivar = b.dataset.active === '1';
        const msg = desactivar
          ? `¿Seguro que querés desactivar a ${b.dataset.name}? No podrá iniciar sesión hasta reactivarlo.`
          : `¿Reactivar a ${b.dataset.name}? Volverá a poder iniciar sesión.`;
        if (!confirm(msg)) return;
        try { await api.put('/users/' + b.dataset.toggle, { active: desactivar ? 0 : 1 }); toast('Usuario actualizado'); refresh(); }
        catch (e) { toast(e.message, 'red'); }
      });
      root.querySelectorAll('[data-reset-score]').forEach((b) => b.onclick = async () => {
        if (!confirm('¿Resetear todos los puntos de ' + b.dataset.name + '? Esta acción no se puede deshacer.')) return;
        try { await api.post('/score/reset-user/' + b.dataset.resetScore); toast('Puntos reseteados', 'green'); refresh(); }
        catch (e) { toast(e.message, 'red'); }
      });
    },
  };
}

// Reset de contraseña: el admin define una contraseña temporal. El sistema NO
// muestra contraseñas en pantalla ni usa valores fijos. El usuario debe
// cambiarla en su proximo ingreso (must_change_password = 1).
function resetPasswordModal(userId, userName, refresh) {
  openModal({
    title: 'Resetear contraseña',
    body: `<form id="rpForm">
      <div class="muted" style="font-size:13px;margin-bottom:10px">Vas a resetear la contraseña de <b>${esc(userName)}</b>. Definí una contraseña temporal; ${esc(userName)} deberá cambiarla en su próximo ingreso. Comunicásela por un canal seguro.</div>
      <div class="form-grid">
        <div class="field"><label>Contraseña temporal *</label><input name="password" type="password" autocomplete="new-password" required minlength="8" /></div>
        <div class="field"><label>Repetir contraseña *</label><input name="password2" type="password" autocomplete="new-password" required /></div>
      </div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="rps">Resetear contraseña</button>',
    onMount: (modal, close) => modal.querySelector('#rps').onclick = async () => {
      const f = Object.fromEntries(new FormData(modal.querySelector('#rpForm')).entries());
      if (!f.password || f.password.length < 8) return toast('La contraseña debe tener al menos 8 caracteres.', 'red');
      if (!/[A-Za-z]/.test(f.password) || !/[0-9]/.test(f.password)) return toast('La contraseña debe incluir letras y números.', 'red');
      if (f.password !== f.password2) return toast('Las contraseñas no coinciden.', 'red');
      try {
        await api.post('/users/' + userId + '/reset-password', { password: f.password });
        toast('Contraseña reseteada. El usuario deberá cambiarla en su próximo ingreso.', 'green');
        close(); if (refresh) refresh();
      } catch (e) { toast(e.message, 'red'); }
    },
  });
}

/* ============ AUDITORIA ============ */
export async function renderAudit() {
  const { audit } = await api.get('/audit');
  const rows = audit.map((a) => `
    <tr><td class="muted">${fmtDateTime(a.created_at)}</td><td><b>${esc(a.user_name || 'Sistema')}</b></td>
    <td><span class="badge gray">${esc(a.action)}</span></td><td>${esc(a.entity_type || '-')}${a.entity_id ? ' #' + a.entity_id : ''}</td><td class="muted">${esc(a.detail || '-')}</td></tr>`).join('');
  const html = `<div class="card table-card"><div class="table-head"><h3 style="font-size:15px">Registro de auditoria</h3></div>
    <table><thead><tr><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Entidad</th><th>Detalle</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5"><div class="empty">Sin registros</div></td></tr>'}</tbody></table></div>`;
  return { html };
}

/* ============ RANKING ============ */
export async function renderRanking() {
  const d = await api.get('/dashboard');
  const periodLabel = d.period ? new Date(d.period + '-01T00:00:00').toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : '';
  const medal = (p) => p === 1 ? 'gold' : p === 2 ? 'silver' : p === 3 ? 'bronze' : '';
  const items = d.ranking.map((r) => {
    const a = r.activity || {};
    const tareasLine = r.assigned > 0
      ? `${r.completed}/${r.assigned} tareas · ${r.progress}%`
      : 'Sin tareas asignadas en el período';
    const chips = [`Contactos ${a.contactos || 0}`, `Cotizaciones ${a.cotizaciones || 0}`, `Ventas ${a.ventas || 0}`, `Inviables ${a.inviables || 0}`, `Completadas ${a.completadas || 0}`]
      .map((t) => `<span class="chip">${t}</span>`).join('');
    const bd = (r.breakdown && r.breakdown.length)
      ? r.breakdown.map((b) => `<span class="chip">${esc(b.reason || 'Otros')}: ${b.points} pts</span>`).join('')
      : (r.score > 0 ? '<span class="muted" style="font-size:12px">Puntos cargados manualmente o de un período anterior.</span>' : '<span class="muted" style="font-size:12px">Sin puntos en el período.</span>');
    return `<div class="rank-item" style="flex-wrap:wrap">
      <div class="rank-pos ${medal(r.position)}">${r.position}</div>
      <div class="avatar" style="background:${r.role === 'admin' ? 'var(--navy)' : r.role === 'siniestros' ? 'var(--purple)' : 'var(--blue)'}">${initials(r.name)}</div>
      <div class="rank-meta" style="flex:1;min-width:180px"><b>${esc(r.name)}</b>
        <div class="sub">${tareasLine} &middot; ${esc(r.role)}</div>
        <div class="row wrap" style="gap:4px;margin-top:6px">${chips}</div>
        <div class="row wrap" style="gap:4px;margin-top:4px"><span class="muted" style="font-size:11px;align-self:center">Puntos:</span> ${bd}</div>
      </div>
      <div class="rank-score"><b>${r.score}</b><span>puntos</span></div></div>`;
  }).join('');
  return { html: `<div class="card pad">
    <div class="row between wrap" style="margin-bottom:10px"><div class="row" style="gap:8px">${icons.trophy}<h3 style="font-size:16px">Ranking del equipo</h3></div><span class="muted" style="font-size:12px">Período: ${esc(periodLabel)}</span></div>
    <div class="muted" style="font-size:12.5px;margin-bottom:10px">El puntaje refleja la actividad del mes (ventas, cotizaciones, tareas). El desglose muestra de dónde sale cada punto; si alguien tiene puntos sin tareas asignadas, es porque provienen de cargas previas o manuales.</div>
    <div class="rank-list">${items || emptyState('Sin datos de ranking en el período.')}</div></div>` };
}

export async function renderTrash() {
  const d = await api.get('/trash');
  const sect = (title, items) => `
    <div class="card table-card" style="margin-bottom:16px"><div class="table-head"><h3 style="font-size:15px">${title}</h3></div>
      <table><thead><tr><th>Nombre</th><th>Eliminado por</th><th>Fecha</th><th></th></tr></thead>
      <tbody>${items.length ? items.map((i) => `<tr><td><b>${esc(i.nombre || '-')}</b></td><td>${esc(i.deleted_name || '-')}</td><td class="muted">${fmtDateTime(i.deleted_at)}</td>
        <td><button class="btn green sm" data-restore="${i.tipo}:${i.id}" aria-label="Restaurar elemento">Restaurar</button></td></tr>`).join('') : '<tr><td colspan="4"><div class="empty">La papelera está vacía.</div></td></tr>'}</tbody></table></div>`;
  const html = sect('Tareas eliminadas', d.tasks) + sect('Campañas eliminadas', d.campaigns) + sect('Objetivos eliminados', d.objectives);
  return {
    html,
    mount: (root) => root.querySelectorAll('[data-restore]').forEach((b) => b.onclick = async () => {
      if (!confirm('¿Restaurar este elemento? Volverá a estar activo en el sistema.')) return;
      const [type, id] = b.dataset.restore.split(':');
      await api.post('/trash/restore', { type, id: Number(id) }); toast('Restaurado', 'green'); refresh();
    }),
  };
}

/* ============ METRICAS DE CONVERSION ============ */
export async function renderMetrics() {
  const m = await api.get('/metrics');
  const f = m.funnel;
  const bar = (label, value, max, color) => `
    <div style="margin-bottom:8px"><div class="row between" style="font-size:13px"><span>${esc(label)}</span><b>${value}</b></div>
      <div class="progress"><span style="width:${max > 0 ? Math.round((value / max) * 100) : 0}%;background:${color}"></span></div></div>`;
  const reasons = (arr) => arr.length ? arr.map((r) => `<div class="row between" style="padding:6px 0;border-bottom:1px solid #f0f2f6"><span>${esc(r.reason)}</span><b>${r.n}</b></div>`).join('') : '<div class="empty">Sin datos</div>';
  const ramoRows = m.por_ramo.map((r) => `<tr><td><b>${esc(r.ramo)}</b></td><td>${r.tot}</td><td>${r.ventas}</td><td><span class="badge ${r.conv >= 20 ? 'green' : 'gray'}">${r.conv}%</span></td></tr>`).join('');
  const empRows = m.por_empleado.map((e) => `<tr><td><b>${esc(e.name)}</b></td><td>${e.asign}</td><td>${e.contactados}</td><td>${e.ventas}</td><td><span class="badge ${e.conv >= 10 ? 'green' : 'gray'}">${e.conv}%</span></td></tr>`).join('');
  const max = Math.max(f.asignadas, 1);
  const html = `
    ${printHeader('Metricas de conversion comercial')}
    <div class="row between" style="margin-bottom:14px"><h3 style="font-size:15px">Embudo comercial</h3>
      <button class="btn ghost sm no-print" id="pdf">Exportar PDF</button></div>
    <div class="grid cols-2">
      <div class="card pad">
        <h3 style="font-size:14px;margin-bottom:12px">Embudo</h3>
        ${bar('Tareas asignadas', f.asignadas, max, 'var(--navy)')}
        ${bar('Contactados', f.contactados, max, 'var(--blue)')}
        ${bar('Cotizaciones enviadas', f.cotizaciones, max, 'var(--purple)')}
        ${bar('Ventas cerradas', f.ventas, max, 'var(--green)')}
        <div class="legend" style="margin-top:12px">
          <span>Contacto/Asignadas: <b>${f.conv_contacto}%</b></span>
          <span>Cotiz./Contacto: <b>${f.conv_cotizacion}%</b></span>
          <span>Venta/Cotiz.: <b>${f.conv_venta}%</b></span>
        </div>
      </div>
      <div class="card pad"><h3 style="font-size:14px;margin-bottom:8px">No interesados por motivo</h3>${reasons(m.no_interesado)}
        <h3 style="font-size:14px;margin:14px 0 8px">Inviables por motivo</h3>${reasons(m.inviable)}</div>
      <div class="card table-card"><div class="table-head"><h3 style="font-size:14px">Conversion por ramo ofrecido</h3></div>
        <table><thead><tr><th>Ramo</th><th>Tareas</th><th>Ventas</th><th>Conv.</th></tr></thead><tbody>${ramoRows || '<tr><td colspan="4"><div class="empty">Sin datos</div></td></tr>'}</tbody></table></div>
      <div class="card table-card"><div class="table-head"><h3 style="font-size:14px">Conversion por empleado</h3></div>
        <table><thead><tr><th>Empleado</th><th>Asign.</th><th>Contact.</th><th>Ventas</th><th>Conv.</th></tr></thead><tbody>${empRows || '<tr><td colspan="5"><div class="empty">Sin datos</div></td></tr>'}</tbody></table></div>
    </div>`;
  return { html, mount: (root) => { const p = root.querySelector('#pdf'); if (p) p.onclick = () => printPDF('Reporte_Metricas_Conversion_Digiano_Asesores'); } };
}

/* ============ AVISOS (admin) ============ */
export async function renderAvisosAdmin() {
  const { avisos } = await api.get('/avisos/manage');
  let users = [];
  try { users = (await api.get('/users')).users.filter((u) => u.active); } catch (e) { console.warn('users (combo)', e); }
  const rows = avisos.map((a) => `
    <tr><td>${a.pinned ? 'ðŸ“Œ ' : ''}<b>${esc(a.title)}</b></td><td><span class="badge ${a.priority === 'alta' ? 'red' : 'gray'}">${esc(a.priority)}</span></td>
      <td>${esc(a.audience)}</td><td>${a.active ? '<span class="badge green">Activo</span>' : '<span class="badge gray">Inactivo</span>'}</td>
      <td class="row" style="gap:6px"><button class="btn outline sm" data-edit="${a.id}">Editar</button><button class="btn outline sm" data-toggle="${a.id}" data-active="${a.active}">${a.active ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('');
  const html = `
    <div class="card table-card"><div class="table-head between"><h3 style="font-size:15px">Avisos / circulares</h3><button class="btn" id="newAviso">${icons.plus} Nuevo aviso</button></div>
      <table><thead><tr><th>Titulo</th><th>Prioridad</th><th>Destinatarios</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5"><div class="empty">No hay avisos publicados.</div></td></tr>'}</tbody></table></div>`;
  return {
    html,
    mount: (root) => {
      root.querySelector('#newAviso').onclick = () => avisoForm(null, users);
      root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => avisoForm(avisos.find((a) => a.id == b.dataset.edit), users));
      root.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => { await api.put('/avisos/' + b.dataset.toggle, { active: b.dataset.active === '1' ? 0 : 1 }); toast('Actualizado'); refresh(); });
    },
  };
}
function avisoForm(a, users) {
  const e = a || {};
  openModal({
    title: a ? 'Editar aviso' : 'Nuevo aviso', wide: true,
    body: `<form id="f"><div class="form-grid">
      <div class="field full"><label>Título *</label><input name="title" value="${esc(e.title || '')}" required /></div>
      <div class="field"><label>Prioridad</label><select name="priority"><option value="normal" ${e.priority === 'normal' ? 'selected' : ''}>Normal</option><option value="alta" ${e.priority === 'alta' ? 'selected' : ''}>Alta</option><option value="baja" ${e.priority === 'baja' ? 'selected' : ''}>Baja</option></select></div>
      <div class="field"><label>Destinatarios</label><select name="audience" id="aud"><option value="todos" ${e.audience === 'todos' ? 'selected' : ''}>Todos</option><option value="comercial" ${e.audience === 'comercial' ? 'selected' : ''}>Comercial</option><option value="siniestros" ${e.audience === 'siniestros' ? 'selected' : ''}>Siniestros</option><option value="marketing" ${e.audience === 'marketing' ? 'selected' : ''}>Marketing</option><option value="user" ${e.audience === 'user' ? 'selected' : ''}>Usuario específico</option></select></div>
      <div class="field" id="userWrap" style="display:${e.audience === 'user' ? 'block' : 'none'}"><label>Usuario</label><select name="target_user_id">${users.map((u) => `<option value="${u.id}" ${u.id == e.target_user_id ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="field full"><label>Texto</label><textarea name="body" rows="4">${esc(e.body || '')}</textarea></div>
      <div class="field full"><label><input type="checkbox" name="pinned" ${e.pinned ? 'checked' : ''}> Fijar arriba</label></div>
    </div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="s">Guardar</button>',
    onMount: (modal, close) => {
      modal.querySelector('#aud').onchange = (ev) => modal.querySelector('#userWrap').style.display = ev.target.value === 'user' ? 'block' : 'none';
      modal.querySelector('#s').onclick = async () => {
        const fd = new FormData(modal.querySelector('#f'));
        const o = Object.fromEntries(fd.entries());
        if (!o.title || !o.title.trim()) return toast('El aviso necesita un título.', 'red');
        if (!o.body || !o.body.trim()) return toast('El aviso necesita un texto.', 'red');
        o.pinned = fd.get('pinned') ? 1 : 0;
        try { if (a) await api.put('/avisos/' + a.id, o); else await api.post('/avisos', o); toast('Guardado', 'green'); close(); refresh(); }
        catch (er) { toast(er.message, 'red'); }
      };
    },
  });
}

/* ============ SUPERVISION ============ */
let _supervisionInterval = null;
export function clearSupervisionInterval() { clearInterval(_supervisionInterval); _supervisionInterval = null; }
export async function renderSupervision() {
  clearSupervisionInterval();
  const { users } = await api.get('/admin/supervision');

  function tiempoRelativo(isoStr) {
    if (!isoStr) return 'Nunca';
    const diff = Date.now() - new Date(isoStr).getTime();
    const h = Math.floor(diff / 3600000);
    if (h < 1) return 'Hace menos de 1h';
    if (h < 24) return `Hace ${h}h`;
    return `Hace ${Math.floor(h / 24)}d`;
  }

  const RESULT_LABEL = {
    no_contactado: 'Sin contactar', no_respondio: 'Sin respuesta', contactado: 'Contactado',
    cotizacion_enviada: 'Cotiz. enviada', venta_cerrada: 'Venta cerrada',
    no_interesado: 'No interesado', inviable: 'Inviable',
  };
  const FINAL = ['venta_cerrada', 'no_interesado', 'inviable'];

  const cards = users.map((u) => {
    const taskRows = u.tasks.map((t) => {
      const estado = RESULT_LABEL[t.result] || 'Sin contactar';
      const completada = FINAL.includes(t.result);
      const estadoClass = completada ? 'gray' : t.atrasada ? 'red' : t.result === 'cotizacion_enviada' ? 'orange' : 'blue';
      const mod = t.last_activity ? tiempoRelativo(t.last_activity) : '-';
      return `<tr>
        <td><b>${esc(t.client_name || '-')}</b></td>
        <td>${esc(t.offer || '-')}</td>
        <td><span class="badge ${estadoClass}">${esc(estado)}</span>${t.atrasada ? ' <span class="badge red">Atrasada</span>' : ''}</td>
        <td class="muted">${mod}</td>
      </tr>`;
    }).join('');

    return `<div class="card pad" style="margin-bottom:18px">
      <div class="row between" style="margin-bottom:12px;align-items:flex-start">
        <div class="row" style="gap:10px;align-items:center">
          <div class="avatar" style="width:36px;height:36px;font-size:13px">${initials(u.name)}</div>
          <div><b style="font-size:15px">${esc(u.name)}</b><br><span class="muted" style="font-size:12px">${esc(u.role)}</span></div>
        </div>
        <div class="muted" style="font-size:12px;text-align:right">
          Última sesión<br><b>${tiempoRelativo(u.ultima_sesion)}</b>
        </div>
      </div>
      <div class="row" style="gap:10px;margin-bottom:14px">
        <div class="card pad" style="flex:1;text-align:center;padding:8px 12px">
          <div style="font-size:22px;font-weight:700;color:var(--muted)">${u.counts.pendiente}</div>
          <div class="muted" style="font-size:11px">Pendientes</div>
        </div>
        <div class="card pad" style="flex:1;text-align:center;padding:8px 12px">
          <div style="font-size:22px;font-weight:700;color:var(--accent)">${u.counts.en_proceso}</div>
          <div class="muted" style="font-size:11px">En progreso</div>
        </div>
        <div class="card pad" style="flex:1;text-align:center;padding:8px 12px">
          <div style="font-size:22px;font-weight:700;color:#22c55e">${u.counts.completada}</div>
          <div class="muted" style="font-size:11px">Completadas</div>
        </div>
      </div>
      ${u.tasks.length ? `
        <table style="width:100%">
          <thead><tr><th>Cliente</th><th>Ramo</th><th>Estado</th><th>Modificada</th></tr></thead>
          <tbody>${taskRows}</tbody>
        </table>` : '<div class="empty">Sin tareas activas</div>'}
    </div>`;
  }).join('');

  const html = `
    <div class="row between" style="margin-bottom:16px;align-items:center">
      <div class="muted" style="font-size:13px">Se actualiza automáticamente cada 30 segundos.</div>
    </div>
    ${users.length ? cards : '<div class="empty">Sin usuarios activos</div>'}`;

  return {
    html,
    mount: (root) => {
      _supervisionInterval = setInterval(async () => {
        try {
          const v = await renderSupervision();
          root.innerHTML = v.html;
        } catch (e) { console.warn('supervision refresh', e); }
      }, 30000);
    },
  };
}
