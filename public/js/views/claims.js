import { api } from '../api.js';
import { icons, esc, toast, openModal, badge, fmtDate, fmtDateTime } from '../ui.js';
import { state, go } from '../app.js';

const STATUSES = ['abierto', 'documentacion_pendiente', 'presentado', 'en_analisis', 'liquidado', 'cerrado'];

export async function renderClaims() {
  const { claims } = await api.get('/claims');
  const counts = {};
  claims.forEach((c) => counts[c.status] = (counts[c.status] || 0) + 1);
  const open = claims.filter((c) => c.status !== 'cerrado');
  const closed = claims.filter((c) => c.status === 'cerrado');

  const card = (c) => `
    <div class="card pad clickable" data-claim="${c.id}" style="cursor:pointer">
      <div class="row between">
        <div><b style="font-size:15px">${esc(c.client_name)}</b><div class="muted" style="font-size:12.5px">${esc(c.type)} ${c.company ? '&middot; ' + esc(c.company) : ''}</div></div>
        ${badge(c.status)}
      </div>
      <div class="muted" style="font-size:12px;margin-top:10px">Creado por ${esc(c.created_name || '-')} &middot; ${fmtDateTime(c.created_at)}</div>
    </div>`;

  const html = `
    <div class="row between wrap" style="margin-bottom:16px">
      <div class="row wrap" style="gap:8px">
        <span class="badge orange">Abiertos: ${open.length}</span>
        <span class="badge green">Liquidados: ${counts.liquidado || 0}</span>
        <span class="badge gray">Cerrados: ${closed.length}</span>
      </div>
      <button class="btn" id="newClaim">${icons.plus} Nuevo siniestro</button>
    </div>
    <div class="section-title">En gestion</div>
    <div class="grid cols-3">${open.length ? open.map(card).join('') : '<div class="empty">Sin siniestros en gestion</div>'}</div>
    ${closed.length ? `<div class="section-title">Cerrados</div><div class="grid cols-3">${closed.map(card).join('')}</div>` : ''}`;

  return {
    html,
    mount: (root) => {
      root.querySelector('#newClaim').onclick = () => openClaimModal();
      root.querySelectorAll('[data-claim]').forEach((el) => el.onclick = () => go('#/siniestros/' + el.dataset.claim));
    },
  };
}

export async function openClaimModal() {
  const { clients } = await api.get('/clients');
  openModal({
    title: 'Nuevo siniestro',
    body: `<form id="claimForm"><div class="form-grid">
      <div class="field full"><label>Cliente *</label><select name="client_id" required>${clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Tipo *</label><select name="type">${state.branches.map((b) => `<option>${b}</option>`).join('')}</select></div>
      <div class="field"><label>Compania</label><input name="company" /></div>
      <div class="field"><label>Fecha del siniestro</label><input name="incident_date" type="date" /></div>
      <div class="field full"><label>Descripcion</label><textarea name="description" rows="3"></textarea></div>
    </div><div class="muted" style="font-size:12px;margin-top:6px">Se notificara automaticamente al area de Siniestros.</div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="saveClaim">Crear siniestro</button>',
    wide: true,
    onMount: (modal, close) => modal.querySelector('#saveClaim').onclick = async () => {
      const f = new FormData(modal.querySelector('#claimForm'));
      try { const r = await api.post('/claims', Object.fromEntries(f.entries())); toast('Siniestro creado y notificado', 'green'); close(); go('#/siniestros/' + r.id); }
      catch (e) { toast(e.message, 'red'); }
    },
  });
}

export async function renderClaimDetail(id) {
  const d = await api.get('/claims/' + id);
  const c = d.claim;
  const canManage = state.user.role === 'siniestros' || state.user.role === 'admin';
  const labels = state.labels.claimStatus || {};

  const events = d.events.map((e) => `
    <div class="tl-item ${e.kind === 'estado' ? 'orange' : e.kind === 'creacion' ? 'green' : ''}">
      <div class="tl-text">${esc(e.text)}</div>
      <div class="tl-meta">${esc(e.user_name || 'Sistema')} &middot; ${fmtDateTime(e.created_at)}</div>
    </div>`).join('');

  const statusSelect = canManage ? `
    <select id="statusSel">${STATUSES.map((s) => `<option value="${s}" ${s === c.status ? 'selected' : ''}>${esc(labels[s] || s)}</option>`).join('')}</select>` : badge(c.status);

  const html = `
    <a href="#/siniestros" class="muted" style="font-size:13px">&larr; Volver a siniestros</a>
    <div class="grid cols-2" style="margin-top:12px;align-items:start">
      <div class="grid" style="gap:16px">
        <div class="card pad">
          <div class="row between"><h2 style="font-size:19px">Siniestro #${c.id}</h2>${badge(c.status)}</div>
          <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13.5px">
            <div><div class="muted" style="font-size:11px">Cliente</div><a href="#/clientes/${c.client_id}"><b>${esc(c.client_name)}</b></a></div>
            <div><div class="muted" style="font-size:11px">Tipo</div><b>${esc(c.type)}</b></div>
            <div><div class="muted" style="font-size:11px">Compania</div>${esc(c.company || '-')}</div>
            <div><div class="muted" style="font-size:11px">Fecha siniestro</div>${fmtDate(c.incident_date)}</div>
            <div><div class="muted" style="font-size:11px">Telefono</div>${esc(c.phone || '-')}</div>
            <div><div class="muted" style="font-size:11px">Gestiona</div>${esc(c.assigned_name || '-')}</div>
          </div>
          ${c.description ? `<div style="margin-top:12px;font-size:13px;background:#f7f9fc;padding:10px 12px;border-radius:10px">${esc(c.description)}</div>` : ''}
          ${canManage ? `<div class="row" style="gap:10px;margin-top:16px"><div style="flex:1">${statusSelect}</div><button class="btn" id="saveStatus">Actualizar estado</button></div>` : ''}
        </div>
      </div>
      <div class="card pad">
        <h3 style="font-size:14px;margin-bottom:14px">Linea de tiempo</h3>
        <div class="timeline">${events}</div>
        <div class="row" style="gap:8px;margin-top:14px">
          <input id="evText" placeholder="Agregar novedad..." style="flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:10px" />
          <button class="btn" id="addEv">Agregar</button>
        </div>
      </div>
    </div>`;

  return {
    html,
    mount: (root) => {
      const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));
      const saveBtn = root.querySelector('#saveStatus');
      if (saveBtn) saveBtn.onclick = async () => {
        try { await api.post('/claims/' + id + '/status', { status: root.querySelector('#statusSel').value }); toast('Estado actualizado', 'green'); refresh(); }
        catch (e) { toast(e.message, 'red'); }
      };
      root.querySelector('#addEv').onclick = async () => {
        const text = root.querySelector('#evText').value.trim();
        if (!text) return;
        await api.post('/claims/' + id + '/event', { text }); toast('Novedad agregada', 'green'); refresh();
      };
    },
  };
}
