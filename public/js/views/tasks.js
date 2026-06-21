import { api } from '../api.js';
import { icons, esc, toast, openModal, badge, fmtDate } from '../ui.js';
import { state, go } from '../app.js';

const NO_INT_REASONS = ['Precio', 'Ya tiene productor', 'Ya tiene cobertura', 'No le interesa', 'Otro'];
const INVIABLE_REASONS = ['Sin telefono', 'Telefono invalido', 'Sin datos suficientes', 'Cliente fallecido', 'Cliente no localizable', 'Dato duplicado', 'Otro'];
const STATE_OPTS = [
  ['no_contactado', 'No contactado'], ['no_respondio', 'No respondio'], ['contactado', 'Contactado'],
  ['cotizacion_enviada', 'Cotizacion enviada'], ['venta_cerrada', 'Venta cerrada'],
  ['no_interesado', 'No interesado'], ['inviable', 'Inviable'],
];
const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export async function renderTodayTasks() {
  const { tasks } = await api.get('/tasks/today');
  const cards = tasks.map((t) => `
    <div class="card task-card" data-task="${t.id}">
      <div class="row between" style="gap:10px">
        <b style="font-size:14.5px;line-height:1.2">${esc(t.client_name || 'Cliente')}</b>
        <span class="badge blue" style="flex:none">${esc(t.offer || '-')}</span>
      </div>
      <select class="task-state" data-id="${t.id}" style="margin-top:9px">
        <option value="">${t.result ? badgeText(t.result) : 'Estado...'}</option>
        ${STATE_OPTS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}
      </select>
      <div class="row" style="gap:6px;margin-top:8px">
        <button class="btn outline sm" data-view="${t.client_id}">Ver cliente</button>
        <button class="btn outline sm" data-obs="${t.client_id}">Observacion</button>
      </div>
    </div>`).join('');

  const html = `
    <div class="card pad" style="background:linear-gradient(120deg,#1f3864,#2e75b6);color:#fff;margin-bottom:16px">
      <div class="row between wrap">
        <div><h2 style="font-size:18px;color:#fff">Tus 5 contactos de hoy</h2>
        <div style="opacity:.85;font-size:13px;margin-top:4px">Elegi el estado de cada contacto. Las tareas no se cierran hasta tener un resultado definitivo.</div></div>
        <div style="text-align:center"><div style="font-size:30px;font-weight:800">${tasks.length}</div><div style="opacity:.85;font-size:12px">activas</div></div>
      </div>
    </div>
    <div class="grid tasks-grid">${cards || '<div class="empty">No hay oportunidades pendientes. Buen trabajo!</div>'}</div>`;

  return {
    html,
    mount: (root) => {
      root.querySelectorAll('.task-state').forEach((sel) => sel.onchange = () => {
        const result = sel.value; const id = sel.dataset.id;
        if (!result) return;
        if (['no_interesado', 'inviable', 'venta_cerrada'].includes(result)) openResultModal(id, result);
        else submitResult(id, { result });
        sel.value = '';
      });
      root.querySelectorAll('[data-view]').forEach((b) => b.onclick = () => { if (b.dataset.view && b.dataset.view !== 'null') go('#/clientes/' + b.dataset.view); });
      root.querySelectorAll('[data-obs]').forEach((b) => b.onclick = () => openObsModal(b.dataset.obs));
    },
  };
}

function openObsModal(clientId) {
  if (!clientId || clientId === 'null') return toast('Tarea sin cliente asociado', 'red');
  openModal({
    title: 'Agregar observacion',
    body: '<div class="field"><textarea id="obsT" rows="3" placeholder="Escribi la observacion..."></textarea></div>',
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="saveObs">Guardar</button>',
    onMount: (modal, close) => modal.querySelector('#saveObs').onclick = async () => {
      const text = modal.querySelector('#obsT').value.trim();
      if (!text) return;
      try { await api.post('/clients/' + clientId + '/observation', { text }); toast('Observacion agregada', 'green'); close(); }
      catch (e) { toast(e.message, 'red'); }
    },
  });
}

function badgeText(r) {
  return (STATE_OPTS.find(([v]) => v === r) || [null, r])[1] + ' (actual)';
}

async function submitResult(taskId, body) {
  try { await api.post('/tasks/' + taskId + '/result', body); toast('Estado registrado', 'green'); refresh(); }
  catch (e) { toast(e.message, 'red'); }
}

function openResultModal(taskId, result) {
  let extra = '';
  if (result === 'no_interesado') extra = `<div class="field"><label>Motivo *</label><select name="reason">${NO_INT_REASONS.map((r) => `<option>${r}</option>`).join('')}</select></div>`;
  else if (result === 'inviable') extra = `<div class="field"><label>Motivo *</label><select name="reason">${INVIABLE_REASONS.map((r) => `<option>${r}</option>`).join('')}</select></div><div class="muted" style="font-size:12px">Los inviables pasan a revision del administrador.</div>`;
  else if (result === 'venta_cerrada') extra = `<div class="form-grid">
      <div class="field"><label>Compania</label><input name="company" /></div>
      <div class="field"><label>Prima mensual</label><input name="premium" type="number" value="0" /></div>
      <div class="field full"><label>Comision estimada</label><input name="commission" type="number" value="0" /></div></div>
      <div class="muted" style="font-size:12px">Se generara el alta automaticamente (pendiente de aprobacion).</div>`;
  const titles = { venta_cerrada: 'Venta cerrada', no_interesado: 'No interesado', inviable: 'Cerrado por inviable' };
  openModal({
    title: titles[result], body: `<form id="resForm">${extra}<div class="field"><label>Nota (opcional)</label><textarea name="note" rows="2"></textarea></div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="saveRes">Confirmar</button>',
    onMount: (modal, close) => {
      modal.querySelector('#saveRes').onclick = async () => {
        const f = new FormData(modal.querySelector('#resForm'));
        await submitResult(taskId, { result, ...Object.fromEntries(f.entries()) });
        close();
      };
    },
  });
}

export async function renderFollowups() {
  const { tasks } = await api.get('/tasks/followups');
  const rows = tasks.map((t) => `
    <tr><td><a href="#/clientes/${t.client_id}"><b>${esc(t.client_name)}</b></a></td>
      <td>${esc(t.offer || '-')}</td><td>${esc(t.phone || '-')}</td>
      <td class="muted">Seguir el ${fmtDate(t.follow_up_date)}</td>
      <td><button class="btn sm" data-task="${t.id}">Registrar resultado</button></td></tr>`).join('');
  const html = `
    <div class="card table-card"><div class="table-head"><h3 style="font-size:15px">Cotizaciones enviadas esperando respuesta</h3></div>
      <table><thead><tr><th>Cliente</th><th>Ofrecido</th><th>Telefono</th><th>Seguimiento</th><th></th></tr></thead>
      <tbody>${rows || '<tr><td colspan="5"><div class="empty">Sin seguimientos pendientes</div></td></tr>'}</tbody></table></div>`;
  return { html, mount: (root) => root.querySelectorAll('[data-task]').forEach((b) => b.onclick = () => openResultModal(b.dataset.task, 'venta_cerrada')) };
}

export async function renderOperativeTasks() {
  const { tasks } = await api.get('/tasks/operativas');
  const isAdmin = state.user.role === 'admin';
  let users = [];
  if (isAdmin) { try { users = (await api.get('/users')).users.filter((u) => u.active); } catch (e) {} }

  const rows = tasks.map((t) => `
    <tr data-id="${t.id}">
      ${isAdmin ? `<td><input type="checkbox" class="chk rowchk" value="${t.id}"></td>` : ''}
      <td><b>${esc(t.title)}</b>${t.client_name ? ` <span class="muted">&middot; ${esc(t.client_name)}</span>` : ''}</td>
      ${isAdmin ? `<td>${esc(t.assigned_name || '-')}</td>` : ''}
      <td>${t.due_date ? fmtDate(t.due_date) : '-'}</td>
      <td>${badge(t.status)}</td>
      <td class="row" style="gap:6px">
        ${t.status !== 'completada' ? `<button class="btn sm green" data-done="${t.id}">Completado</button>` : `<span class="muted">${esc(t.result_note || '')}</span>`}
        ${isAdmin ? `<button class="btn outline sm" data-edit="${t.id}">Editar</button><button class="btn outline sm" data-del="${t.id}">Borrar</button>` : ''}
      </td>
    </tr>`).join('');

  const cols = (isAdmin ? 1 : 0) + 4 + 1;
  const html = `
    ${isAdmin ? '<div id="bulkbar"></div>' : ''}
    <div class="card table-card">
      <div class="table-head between"><h3 style="font-size:15px">Tareas operativas</h3><button class="btn" id="newTask">${icons.plus} Nueva tarea</button></div>
      <table><thead><tr>${isAdmin ? '<th><input type="checkbox" class="chk" id="chkAll"></th>' : ''}<th>Tarea</th>${isAdmin ? '<th>Asignada a</th>' : ''}<th>Vence</th><th>Estado</th><th></th></tr></thead>
      <tbody>${rows || `<tr><td colspan="${cols}"><div class="empty">Sin tareas operativas</div></td></tr>`}</tbody></table>
    </div>`;

  return {
    html,
    mount: (root) => {
      root.querySelector('#newTask').onclick = () => openTaskModal(isAdmin, users);
      root.querySelectorAll('[data-done]').forEach((b) => b.onclick = () => completeTask(b.dataset.done));
      if (isAdmin) {
        root.querySelectorAll('[data-edit]').forEach((b) => b.onclick = () => openEditTask(b.dataset.edit, tasks.find((t) => t.id == b.dataset.edit), users));
        root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
          if (!confirm('Mover esta tarea a la papelera?')) return;
          try { await api.del('/tasks/' + b.dataset.del); toast('Tarea movida a la papelera'); refresh(); }
          catch (e) { toast(e.message, 'red'); }
        });
        setupBulk(root, users);
      }
    },
  };
}

function completeTask(id) {
  openModal({
    title: 'Completar tarea', body: '<div class="field"><label>Resultado / comentario</label><textarea id="tn" rows="2"></textarea></div>',
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn green" id="ok">Completado</button>',
    onMount: (modal, close) => modal.querySelector('#ok').onclick = async () => {
      await api.post('/tasks/' + id + '/status', { status: 'completada', note: modal.querySelector('#tn').value });
      toast('Tarea completada', 'green'); close(); refresh();
    },
  });
}

function setupBulk(root, users) {
  const bar = root.querySelector('#bulkbar');
  const checks = () => Array.from(root.querySelectorAll('.rowchk')).filter((c) => c.checked).map((c) => Number(c.value));
  const render = () => {
    const sel = checks();
    if (!sel.length) { bar.innerHTML = ''; return; }
    bar.innerHTML = `<div class="bulkbar">
      <b>${sel.length} seleccionada(s)</b>
      <select id="bAssign"><option value="">Reasignar a...</option>${users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select>
      <select id="bStatus"><option value="">Cambiar estado...</option><option value="pendiente">Pendiente</option><option value="en_proceso">En proceso</option><option value="completada">Completada</option></select>
      <button class="btn sm" id="bArch">Archivar</button>
      <div class="sp"></div></div>`;
    bar.querySelector('#bAssign').onchange = (e) => e.target.value && bulk('reasignar', Number(e.target.value), sel);
    bar.querySelector('#bStatus').onchange = (e) => e.target.value && bulk('estado', e.target.value, sel);
    bar.querySelector('#bArch').onclick = () => bulk('archivar', null, sel);
  };
  root.querySelector('#chkAll').onchange = (e) => { root.querySelectorAll('.rowchk').forEach((c) => c.checked = e.target.checked); render(); };
  root.querySelectorAll('.rowchk').forEach((c) => c.onchange = render);
}
async function bulk(action, value, ids) {
  try { const r = await api.post('/tasks/bulk', { ids, action, value }); toast(`${r.count} tareas actualizadas`, 'green'); refresh(); }
  catch (e) { toast(e.message, 'red'); }
}

function openEditTask(id, t, users) {
  openModal({
    title: 'Editar tarea',
    body: `<form id="ef"><div class="form-grid">
      <div class="field full"><label>Titulo</label><input name="title" value="${esc(t.title || '')}" /></div>
      <div class="field"><label>Asignar a</label><select name="assigned_to">${users.map((u) => `<option value="${u.id}" ${u.id == t.assigned_to ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Vence</label><input name="due_date" type="date" value="${t.due_date || ''}" /></div>
    </div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="s">Guardar</button>',
    onMount: (modal, close) => modal.querySelector('#s').onclick = async () => {
      const f = new FormData(modal.querySelector('#ef'));
      await api.put('/tasks/' + id + '/edit', Object.fromEntries(f.entries())); toast('Tarea actualizada', 'green'); close(); refresh();
    },
  });
}

async function openTaskModal(isAdmin, users) {
  const { clients } = await api.get('/clients');
  openModal({
    title: 'Nueva tarea operativa',
    body: `<form id="taskForm"><div class="form-grid">
      <div class="field full"><label>Titulo *</label><input name="title" placeholder="Mandar poliza, pedir documentacion..." required /></div>
      ${isAdmin ? `<div class="field"><label>Asignar a</label><select name="assigned_to"><option value="">Yo mismo</option>${users.map((u) => `<option value="${u.id}">${esc(u.name)}</option>`).join('')}</select></div>` : ''}
      <div class="field"><label>Vence</label><input name="due_date" type="date" /></div>
      <div class="field full"><label>Cliente (opcional)</label><select name="client_id"><option value="">-</option>${clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
    </div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="saveTask">Crear</button>',
    onMount: (modal, close) => modal.querySelector('#saveTask').onclick = async () => {
      const f = new FormData(modal.querySelector('#taskForm'));
      const body = Object.fromEntries(f.entries());
      if (!body.title) return toast('Falta el titulo', 'red');
      try { await api.post('/tasks', body); toast('Tarea creada', 'green'); close(); refresh(); }
      catch (e) { toast(e.message, 'red'); }
    },
  });
}

export async function renderMyPerformance() {
  const d = await api.get('/dashboard');
  const me = d.ranking.find((r) => r.id === state.user.id) || { score: 0, position: '-', assigned: 0, completed: 0 };
  let followups = 0;
  try { followups = (await api.get('/tasks/followups')).tasks.length; } catch (e) {}
  const kpi = (label, value, color) => `<div class="card kpi"><span class="label">${label}</span><div class="value" style="color:${color || 'var(--ink)'}">${value}</div></div>`;
  const html = `
    <div class="card pad" style="background:linear-gradient(120deg,#1f3864,#2e75b6);color:#fff;margin-bottom:16px">
      <div class="row between wrap">
        <div><div style="opacity:.85;font-size:13px">Tu posicion en el ranking</div><h2 style="font-size:34px;color:#fff">#${me.position}</h2></div>
        <div style="text-align:center"><div style="font-size:34px;font-weight:800">${me.score}</div><div style="opacity:.85;font-size:12px">puntos del mes</div></div>
      </div>
    </div>
    <div class="grid kpis">
      ${kpi('Tareas asignadas', me.assigned)}
      ${kpi('Tareas completadas', me.completed, 'var(--green)')}
      ${kpi('Avance', (me.progress || 0) + '%', 'var(--blue)')}
      ${kpi('Seguimientos activos', followups, 'var(--orange)')}
    </div>`;
  return { html };
}
