import { api } from '../api.js';
import { icons, esc, fmtMoney, fmtDateTime, toast, openModal, badge } from '../ui.js';
import { state, go } from '../app.js';

export async function renderMovements() {
  const { movements } = await api.get('/movements');
  const rows = movements.map((m) => `
    <tr>
      <td>${m.type === 'alta' ? '<span class="badge green">Alta</span>' : '<span class="badge red">Baja</span>'}</td>
      <td><a href="#/clientes/${m.client_id}"><b>${esc(m.client_name)}</b></a></td>
      <td>${esc(m.branch)}</td>
      <td>${esc(m.company || '-')}</td>
      <td>${fmtMoney(m.commission)}</td>
      <td>${badge(m.status)}</td>
      <td class="muted">${esc(m.created_name || '-')} &middot; ${fmtDateTime(m.created_at)}</td>
    </tr>`).join('');

  const html = `
    <div class="card table-card">
      <div class="table-head between">
        <h3 style="font-size:15px">Movimientos recientes</h3>
        <button class="btn" id="newMov">${icons.plus} Registrar movimiento</button>
      </div>
      <table><thead><tr><th>Tipo</th><th>Cliente</th><th>Ramo</th><th>Compania</th><th>Comision</th><th>Estado</th><th>Origen</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7"><div class="empty">Sin movimientos</div></td></tr>'}</tbody></table>
    </div>`;

  return { html, mount: (root) => { root.querySelector('#newMov').onclick = () => openMovementModal(); } };
}

export async function openMovementModal(presetClientId) {
  const { clients } = await api.get('/clients');
  const opts = clients.map((c) => `<option value="${c.id}" ${c.id == presetClientId ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  openModal({
    title: 'Registrar movimiento',
    body: `<form id="movForm"><div class="form-grid">
      <div class="field full"><label>Cliente *</label><select name="client_id" required>${opts}</select></div>
      <div class="field"><label>Tipo *</label><select name="type"><option value="alta">Alta</option><option value="baja">Baja</option></select></div>
      <div class="field"><label>Ramo *</label><select name="branch">${state.branches.map((b) => `<option>${b}</option>`).join('')}</select></div>
      <div class="field"><label>Compania</label><input name="company" /></div>
      <div class="field"><label>N. Poliza</label><input name="policy_number" /></div>
      <div class="field"><label>Prima mensual</label><input name="premium" type="number" value="0" /></div>
      <div class="field"><label>Comision estimada</label><input name="commission" type="number" value="0" /></div>
      <div class="field full"><label>Nota</label><input name="note" /></div>
    </div>
    <div class="muted" style="font-size:12px;margin-top:6px">El movimiento actualiza automaticamente el perfil del cliente${state.user.role !== 'admin' ? ' (queda pendiente de aprobacion del administrador)' : ''}.</div>
    </form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="saveMov">Registrar</button>',
    wide: true,
    onMount: (modal, close) => {
      modal.querySelector('#saveMov').onclick = async () => {
        const f = new FormData(modal.querySelector('#movForm'));
        try {
          const r = await api.post('/movements', Object.fromEntries(f.entries()));
          toast(r.status === 'pendiente' ? 'Movimiento enviado a aprobacion' : 'Movimiento registrado y perfil actualizado', 'green');
          close(); window.dispatchEvent(new HashChangeEvent('hashchange'));
        } catch (e) { toast(e.message, 'red'); }
      };
    },
  });
}
