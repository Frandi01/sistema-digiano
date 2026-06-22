import { api } from '../api.js';
import { icons, esc, fmtMoney, fmtDate, fmtDateTime, toast, openModal, badge, initials, printPDF, printHeader } from '../ui.js';
import { state } from '../app.js';

const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

/* ============ APROBACIONES ============ */
export async function renderApprovals() {
  const d = await api.get('/approvals');
  let changes = [];
  try { changes = (await api.get('/change-requests')).requests; } catch (e) {}

  const movRows = d.movements.map((m) => `
    <tr><td>${m.type === 'alta' ? '<span class="badge green">Alta</span>' : '<span class="badge red">Baja</span>'}</td>
      <td><b>${esc(m.client_name)}</b></td><td>${esc(m.branch)}</td><td>${esc(m.created_name || '-')}</td><td>${fmtMoney(m.commission)}</td>
      <td><button class="btn green sm" data-app-mov="${m.id}">Aprobar</button> <button class="btn outline sm" data-rej-mov="${m.id}">Rechazar</button></td></tr>`).join('');
  const cliRows = d.clients.map((c) => `
    <tr><td><b>${esc(c.name)}</b></td><td>${esc(c.phone || '-')}</td><td>${esc(c.created_name || '-')}</td>
    <td><button class="btn green sm" data-app-cli="${c.id}">Aprobar cliente</button></td></tr>`).join('');
  const chRows = changes.map((c) => `
    <tr><td><b>${esc(c.summary || c.type)}</b></td><td>${esc(c.client_name || '-')}</td><td>${esc(c.requested_name || '-')}</td>
    <td><button class="btn green sm" data-app-ch="${c.id}">Aprobar</button> <button class="btn outline sm" data-rej-ch="${c.id}">Rechazar</button></td></tr>`).join('');

  const block = (title, head, rows, cols) => `
    <div class="card table-card" style="margin-bottom:18px"><div class="table-head"><h3 style="font-size:15px">${title}</h3></div>
      <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows || `<tr><td colspan="${cols}"><div class="empty">Nada pendiente</div></td></tr>`}</tbody></table></div>`;

  const html =
    block('Movimientos pendientes', ['Tipo', 'Cliente', 'Ramo', 'Cargado por', 'Comision', ''], movRows, 6) +
    block('Cambios de datos pendientes', ['Cambio', 'Cliente', 'Solicitado por', ''], chRows, 4) +
    block('Clientes nuevos por aprobar', ['Cliente', 'Telefono', 'Creado por', ''], cliRows, 4);

  return {
    html,
    mount: (root) => {
      const act = (sel, fn) => root.querySelectorAll(sel).forEach((b) => b.onclick = () => fn(b));
      act('[data-app-mov]', async (b) => { await api.post('/movements/' + b.dataset.appMov + '/approve'); toast('Aprobado', 'green'); refresh(); });
      act('[data-rej-mov]', async (b) => { await api.post('/movements/' + b.dataset.rejMov + '/reject', { reason: 'Rechazado por admin' }); toast('Rechazado'); refresh(); });
      act('[data-app-cli]', async (b) => { await api.post('/clients/' + b.dataset.appCli + '/approve'); toast('Cliente aprobado', 'green'); refresh(); });
      act('[data-app-ch]', async (b) => { await api.post('/change-requests/' + b.dataset.appCh + '/resolve', { decision: 'aprobar' }); toast('Cambio aprobado', 'green'); refresh(); });
      act('[data-rej-ch]', async (b) => { await api.post('/change-requests/' + b.dataset.rejCh + '/resolve', { decision: 'rechazar' }); toast('Cambio rechazado'); refresh(); });
    },
  };
}

/* ============ OBJETIVOS ============ */
export async function renderObjectives() {
  const { objectives } = await api.get('/objectives');
  const byBranch = {};
  try { (await api.get('/opportunities')).opportunities.forEach((o) => byBranch[o.offer] = (byBranch[o.offer] || 0) + 1); } catch (e) {}
  const prio = (p) => `<span class="badge ${p === 'alta' ? 'red' : p === 'baja' ? 'gray' : 'orange'}">${esc(p || 'media')}</span>`;
  const rows = objectives.map((o) => `
    <tr><td><b>${esc(o.name)}</b> ${o.active ? '<span class="badge green">Activo</span>' : '<span class="badge gray">Inactivo</span>'}</td>
      <td>${esc(o.branch || 'Todos')}</td><td>${o.target}</td><td>${prio(o.priority)}</td>
      <td>${o.branch ? `<span class="badge orange">${byBranch[o.branch] || 0} clientes</span>` : '<span class="muted">-</span>'}</td>
      <td>${fmtDate(o.start_date)} - ${fmtDate(o.end_date)}</td>
      <td class="row" style="gap:6px"><button class="btn outline sm" data-edit="${o.id}">Editar</button><button class="btn outline sm" data-del="${o.id}">Borrar</button></td></tr>`).join('');
  const html = `
    <div class="card pad" style="margin-bottom:14px"><div class="muted" style="font-size:13px">Los objetivos <b>miden</b> el avance del mes y ademas <b>dirigen</b> las tareas comerciales: el sistema prioriza contactar clientes que pueden comprar el ramo del objetivo, segun su prioridad. Un objetivo de ramo "Todos" solo mide (no dirige tareas).</div></div>
    <div class="card table-card"><div class="table-head between"><h3 style="font-size:15px">Objetivos</h3><button class="btn" id="newObj">${icons.plus} Nuevo objetivo</button></div>
      <table><thead><tr><th>Nombre</th><th>Ramo</th><th>Meta</th><th>Prioridad</th><th>Potencial</th><th>Periodo</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="7"><div class="empty">Sin objetivos</div></td></tr>'}</tbody></table></div>`;
  return {
    html,
    mount: (root) => {
      root.querySelector('#newObj').onclick = () => objForm();
      root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => objForm(objectives.find((o) => o.id == b.dataset.edit)));
      root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { if (confirm('Mover objetivo a la papelera?')) { await api.del('/objectives/' + b.dataset.del); toast('A la papelera'); refresh(); } });
    },
  };
}
function objForm(o) {
  const e = o || {};
  openModal({
    title: o ? 'Editar objetivo' : 'Nuevo objetivo',
    body: `<form id="f"><div class="form-grid">
      <div class="field full"><label>Nombre *</label><input name="name" value="${esc(e.name || '')}" required /></div>
      <div class="field"><label>Ramo objetivo</label><select name="branch"><option value="">Todos (solo medir)</option>${state.branches.map((b) => `<option ${b === e.branch ? 'selected' : ''}>${b}</option>`).join('')}</select></div>
      <div class="field"><label>Meta (altas)</label><input name="target" type="number" value="${e.target ?? 10}" /></div>
      <div class="field"><label>Prioridad (dirige tareas)</label><select name="priority"><option value="alta" ${e.priority === 'alta' ? 'selected' : ''}>Alta</option><option value="media" ${(e.priority || 'media') === 'media' ? 'selected' : ''}>Media</option><option value="baja" ${e.priority === 'baja' ? 'selected' : ''}>Baja</option></select></div>
      <div class="field"><label>Comision promedio</label><input name="avg_commission" type="number" value="${e.avg_commission ?? 0}" /></div>
      <div class="field"><label>Inicio</label><input name="start_date" type="date" value="${e.start_date || ''}" /></div>
      <div class="field"><label>Fin</label><input name="end_date" type="date" value="${e.end_date || ''}" /></div>
    </div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="s">Guardar</button>',
    onMount: (modal, close) => modal.querySelector('#s').onclick = async () => {
      const f = Object.fromEntries(new FormData(modal.querySelector('#f')).entries());
      try { if (o) await api.put('/objectives/' + o.id, f); else await api.post('/objectives', f); toast('Guardado', 'green'); close(); refresh(); }
      catch (er) { toast(er.message, 'red'); }
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
    <div class="card table-card"><div class="table-head between"><h3 style="font-size:15px">Campanas</h3><button class="btn" id="newCamp">${icons.plus} Nueva campana</button></div>
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
      <td><button class="btn outline sm" data-reset="${u.id}">Reset pass</button> <button class="btn outline sm" data-toggle="${u.id}" data-active="${u.active}">${u.active ? 'Desactivar' : 'Activar'}</button> <button class="btn outline sm red" data-reset-score="${u.id}" data-name="${esc(u.name)}">Reset puntos</button></td></tr>`).join('');
  const html = `
    <div class="card table-card"><div class="table-head between"><h3 style="font-size:15px">Usuarios del sistema</h3><button class="btn" id="newUser">${icons.plus} Nuevo usuario</button></div>
      <table><thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Ultimo ingreso</th><th></th></tr></thead>
      <tbody>${rows}</tbody></table></div>`;
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
          <div class="field"><label>Contrasena temporal</label><input name="password" value="Digiano2026" /></div>
        </div><div class="muted" style="font-size:12px">Debera cambiarla en el primer ingreso.</div></form>`,
        footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="s">Crear usuario</button>',
        onMount: (modal, close) => modal.querySelector('#s').onclick = async () => {
          const f = Object.fromEntries(new FormData(modal.querySelector('#uForm')).entries());
          try { const r = await api.post('/users', f); toast('Usuario creado. Pass: ' + r.tempPassword, 'green'); close(); refresh(); }
          catch (e) { toast(e.message, 'red'); }
        },
      });
      root.querySelectorAll('[data-reset]').forEach((b) => b.onclick = async () => { const r = await api.post('/users/' + b.dataset.reset + '/reset-password', {}); toast('Pass reseteada: ' + r.tempPassword, 'green'); });
      root.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = async () => { await api.put('/users/' + b.dataset.toggle, { active: b.dataset.active === '1' ? 0 : 1 }); toast('Usuario actualizado'); refresh(); });
      root.querySelectorAll('[data-reset-score]').forEach((b) => b.onclick = async () => { if (confirm('Resetear todos los puntos de ' + b.dataset.name + '?')) { await api.post('/score/reset-user/' + b.dataset.resetScore); toast('Puntos reseteados', 'green'); refresh(); } });
    },
  };
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
  const medal = (p) => p === 1 ? 'gold' : p === 2 ? 'silver' : p === 3 ? 'bronze' : '';
  const items = d.ranking.map((r) => `
    <div class="rank-item"><div class="rank-pos ${medal(r.position)}">${r.position}</div>
      <div class="avatar" style="background:${r.role === 'admin' ? 'var(--navy)' : r.role === 'siniestros' ? 'var(--purple)' : 'var(--blue)'}">${initials(r.name)}</div>
      <div class="rank-meta"><b>${esc(r.name)}</b><div class="sub">${r.completed}/${r.assigned} tareas &middot; ${r.progress}% &middot; ${r.role}</div>
      <div class="progress" style="margin-top:6px;max-width:280px"><span style="width:${r.progress}%"></span></div></div>
      <div class="rank-score"><b>${r.score}</b><span>puntos</span></div></div>`).join('');
  return { html: `<div class="card pad"><div class="row" style="gap:8px;margin-bottom:12px">${icons.trophy}<h3 style="font-size:16px">Ranking del equipo</h3></div><div class="rank-list">${items}</div></div>` };
}

/* ============ PAPELERA ============ */
export async function renderTrash() {
  const d = await api.get('/trash');
  const sect = (title, items) => `
    <div class="card table-card" style="margin-bottom:16px"><div class="table-head"><h3 style="font-size:15px">${title}</h3></div>
      <table><thead><tr><th>Nombre</th><th>Eliminado por</th><th>Fecha</th><th></th></tr></thead>
      <tbody>${items.length ? items.map((i) => `<tr><td><b>${esc(i.nombre || '-')}</b></td><td>${esc(i.deleted_name || '-')}</td><td class="muted">${fmtDateTime(i.deleted_at)}</td>
        <td><button class="btn green sm" data-restore="${i.tipo}:${i.id}">Restaurar</button></td></tr>`).join('') : '<tr><td colspan="4"><div class="empty">Vacio</div></td></tr>'}</tbody></table></div>`;
  const html = sect('Tareas eliminadas', d.tasks) + sect('Campanas eliminadas', d.campaigns) + sect('Objetivos eliminados', d.objectives);
  return {
    html,
    mount: (root) => root.querySelectorAll('[data-restore]').forEach((b) => b.onclick = async () => {
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
  try { users = (await api.get('/users')).users.filter((u) => u.active); } catch (e) {}
  const rows = avisos.map((a) => `
    <tr><td>${a.pinned ? 'ðŸ“Œ ' : ''}<b>${esc(a.title)}</b></td><td><span class="badge ${a.priority === 'alta' ? 'red' : 'gray'}">${esc(a.priority)}</span></td>
      <td>${esc(a.audience)}</td><td>${a.active ? '<span class="badge green">Activo</span>' : '<span class="badge gray">Inactivo</span>'}</td>
      <td class="row" style="gap:6px"><button class="btn outline sm" data-edit="${a.id}">Editar</button><button class="btn outline sm" data-toggle="${a.id}" data-active="${a.active}">${a.active ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('');
  const html = `
    <div class="card table-card"><div class="table-head between"><h3 style="font-size:15px">Avisos / circulares</h3><button class="btn" id="newAviso">${icons.plus} Nuevo aviso</button></div>
      <table><thead><tr><th>Titulo</th><th>Prioridad</th><th>Destinatarios</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5"><div class="empty">Sin avisos</div></td></tr>'}</tbody></table></div>`;
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
      <div class="field full"><label>Titulo *</label><input name="title" value="${esc(e.title || '')}" required /></div>
      <div class="field"><label>Prioridad</label><select name="priority"><option value="normal" ${e.priority === 'normal' ? 'selected' : ''}>Normal</option><option value="alta" ${e.priority === 'alta' ? 'selected' : ''}>Alta</option><option value="baja" ${e.priority === 'baja' ? 'selected' : ''}>Baja</option></select></div>
      <div class="field"><label>Destinatarios</label><select name="audience" id="aud"><option value="todos" ${e.audience === 'todos' ? 'selected' : ''}>Todos</option><option value="comercial" ${e.audience === 'comercial' ? 'selected' : ''}>Comercial</option><option value="siniestros" ${e.audience === 'siniestros' ? 'selected' : ''}>Siniestros</option><option value="marketing" ${e.audience === 'marketing' ? 'selected' : ''}>Marketing</option><option value="user" ${e.audience === 'user' ? 'selected' : ''}>Usuario especifico</option></select></div>
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
      const mod = t.last_activity ? tiempoRelativo(t.last_activity) : '—';
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
          Ultima sesion<br><b>${tiempoRelativo(u.ultima_sesion)}</b>
        </div>
      </div>
      <div class="row" style="gap:10px;margin-bottom:14px">
        <div class="card pad" style="flex:1;text-align:center;padding:8px 12px">
          <div style="font-size:22px;font-weight:700;color:var(--muted)">${u.counts.pendiente}</div>
          <div class="muted" style="font-size:11px">Pendientes</div>
        </div>
        <div class="card pad" style="flex:1;text-align:center;padding:8px 12px">
          <div style="font-size:22px;font-weight:700;color:var(--accent)">${u.counts.en_progreso}</div>
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
      <div class="muted" style="font-size:13px">Se actualiza automÃ¡ticamente cada 30 segundos.</div>
    </div>
    ${users.length ? cards : '<div class="empty">Sin usuarios activos</div>'}`;

  return {
    html,
    mount: (root) => {
      _supervisionInterval = setInterval(async () => {
        try {
          const v = await renderSupervision();
          root.innerHTML = v.html;
        } catch (e) {}
      }, 30000);
    },
  };
}

