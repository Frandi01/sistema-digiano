import { api } from '../api.js';
import { icons, esc, fmtMoney, fmtDateTime, toast, openModal, badge, errorState } from '../ui.js';
import { state, go } from '../app.js';

const reRender = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

// ---- Modal: NUEVO cliente (con su poliza) ----
function openNewClientModal() {
  const branches = (state.branches && state.branches.length) ? state.branches : ['Auto', 'Hogar', 'Vida', 'Salud', 'AP', 'Comercio', 'Caucion', 'ART'];
  openModal({
    title: 'Nuevo cliente',
    body: `<form id="clientForm"><div class="form-grid">
      <div class="field full"><label>Nombre y apellido *</label><input name="name" required autofocus /></div>
      <div class="field"><label>Qué póliza tiene</label>
        <select name="branch">${branches.map((b) => `<option value="${esc(b)}">${esc(b)}</option>`).join('')}</select></div>
      <div class="field"><label>Número de póliza</label><input name="policy_number" /></div>
      <div class="field"><label>Mail</label><input name="email" type="email" /></div>
      <div class="field"><label>Teléfono</label><input name="phone" /></div>
    </div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="saveClient">Guardar cliente</button>',
    onMount: (modal, close) => {
      const btn = modal.querySelector('#saveClient');
      btn.addEventListener('click', async () => {
        const form = modal.querySelector('#clientForm');
        const body = Object.fromEntries(new FormData(form).entries());
        if (!body.name || !body.name.trim()) { toast('Ingresa el nombre y apellido', 'red'); return; }
        btn.disabled = true;
        try {
          const r = await api.post('/clients', body);
          toast(r.status === 'pendiente' ? 'Cliente creado (pendiente de aprobación)' : 'Cliente agregado', 'green');
          close();
          reRender();
        } catch (e) {
          btn.disabled = false;
          toast(e.message || 'No se pudo crear el cliente', 'red');
        }
      });
    },
  });
}

// ---- Modal: EDITAR cliente ----
function openEditClientModal(c) {
  openModal({
    title: 'Editar cliente',
    body: `<form id="editForm"><div class="form-grid">
      <div class="field full"><label>Nombre y apellido *</label><input name="name" value="${esc(c.name || '')}" required /></div>
      <div class="field"><label>Teléfono</label><input name="phone" value="${esc(c.phone || '')}" /></div>
      <div class="field"><label>Mail</label><input name="email" type="email" value="${esc(c.email || '')}" /></div>
      <div class="field full"><label>Etiquetas (separadas por coma)</label><input name="tags" value="${esc(c.tags || '')}" /></div>
      <div class="field full"><label>Observaciones</label><textarea name="observations" rows="3">${esc(c.observations || '')}</textarea></div>
    </div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="saveEdit">Guardar</button>',
    onMount: (modal, close) => {
      modal.querySelector('#saveEdit').addEventListener('click', async () => {
        const body = Object.fromEntries(new FormData(modal.querySelector('#editForm')).entries());
        if (!body.name) { toast('El nombre es obligatorio', 'red'); return; }
        try {
          const r = await api.put('/clients/' + c.id, body);
          toast(r.pending ? 'Cambios enviados a aprobación' : 'Cliente actualizado', 'green');
          close(); reRender();
        } catch (e) { toast(e.message, 'red'); }
      });
    },
  });
}

export async function renderClients() {
  const st = { q: '', policy: '', product: '', sort: 'name', dir: 'asc', page: 1, pageSize: 25 };
  const first = await api.get('/clients?pageSize=25');
  const products = first.products || [];
  const rows = (list) => list.map((c) => `
    <tr class="clickable" data-id="${c.id}">
      <td><b>${esc(c.name)}</b>${c.status === 'pendiente' ? ' <span class="badge orange">Pendiente</span>' : ''}</td>
      <td>${esc(c.phone || '-')}</td>
      <td>${esc(c.email || '-')}</td>
      <td><span class="badge navy">${c.products} producto${c.products === 1 ? '' : 's'}</span></td>
      <td>${(c.tags || '').split(',').filter(Boolean).slice(0, 2).map((t) => `<span class="chip">${esc(t.trim())}</span>`).join('') || '-'}</td>
    </tr>`).join('');

  const html = `
    <div class="card table-card">
      <div class="table-head between wrap" style="gap:10px">
        <div class="row wrap" style="gap:8px;flex:1;min-width:0">
          <div class="search">${icons.search}<input id="cQ" placeholder="Buscar por nombre..." autocomplete="off" /></div>
          <input id="cPol" class="filter-ctl" placeholder="N° de póliza" autocomplete="off" />
          <select id="cProd" class="filter-ctl" aria-label="Filtrar por producto"><option value="">Todos los productos</option>${products.map((pr) => `<option>${esc(pr)}</option>`).join('')}</select>
          <select id="cSort" class="filter-ctl" aria-label="Ordenar por"><option value="name">Nombre</option><option value="created">Fecha de alta</option><option value="product">Productos</option></select>
          <select id="cDir" class="filter-ctl" aria-label="Dirección de orden"><option value="asc">Ascendente</option><option value="desc">Descendente</option></select>
          <select id="cSize" class="filter-ctl" aria-label="Cantidad por página"><option value="25">25 por pág.</option><option value="50">50 por pág.</option><option value="100">100 por pág.</option></select>
        </div>
        <div class="row" style="gap:8px">
          <button type="button" class="btn outline" id="newMov" aria-label="Ver altas y bajas">${icons.movements} Altas / Bajas</button>
          <button type="button" class="btn" id="newClient" aria-label="Crear nuevo cliente">${icons.plus} Nuevo cliente</button>
        </div>
      </div>
      <div class="table-scroll">
        <table><thead><tr><th>Cliente</th><th>Teléfono</th><th>Email</th><th>Productos</th><th>Etiquetas</th></tr></thead>
          <tbody id="cBody"><tr><td colspan="5"><div class="empty">Cargando...</div></td></tr></tbody>
        </table>
      </div>
      <div class="row between wrap" id="cPager" style="padding:10px 14px;gap:8px"></div>
    </div>`;

  return {
    html,
    mount: (root) => {
      const body = root.querySelector('#cBody');
      const pager = root.querySelector('#cPager');
      root.querySelector('#newClient')?.addEventListener('click', openNewClientModal);
      root.querySelector('#newMov')?.addEventListener('click', () => go('#/movimientos'));
      body.addEventListener('click', (e) => { const tr = e.target.closest('tr[data-id]'); if (tr) go('#/clientes/' + tr.dataset.id); });

      async function load() {
        const params = new URLSearchParams({ q: st.q, policy: st.policy, product: st.product, sort: st.sort, dir: st.dir, page: String(st.page), pageSize: String(st.pageSize) });
        let res;
        try { res = await api.get('/clients?' + params.toString()); }
        catch (e) { console.warn('clients load', e); body.innerHTML = `<tr><td colspan="5">${errorState('No se pudieron cargar los clientes. Reintentá.')}</td></tr>`; pager.innerHTML = ''; return; }
        body.innerHTML = res.clients.length ? rows(res.clients) : '<tr><td colspan="5"><div class="empty">No hay clientes que coincidan con los filtros.</div></td></tr>';
        const totalPages = Math.max(1, Math.ceil(res.total / res.pageSize));
        if (st.page > totalPages) { st.page = totalPages; return load(); }
        const from = res.total === 0 ? 0 : (res.page - 1) * res.pageSize + 1;
        const to = Math.min(res.total, res.page * res.pageSize);
        pager.innerHTML = `<span class="muted" style="font-size:12.5px">Mostrando ${from}–${to} de ${res.total} clientes</span>
          <div class="row" style="gap:6px;align-items:center">
            <button class="btn outline sm" id="pPrev" ${res.page <= 1 ? 'disabled' : ''} aria-label="Página anterior">Anterior</button>
            <span class="muted" style="font-size:12.5px">Página ${res.page} de ${totalPages}</span>
            <button class="btn outline sm" id="pNext" ${res.page >= totalPages ? 'disabled' : ''} aria-label="Página siguiente">Siguiente</button>
          </div>`;
        pager.querySelector('#pPrev')?.addEventListener('click', () => { if (st.page > 1) { st.page--; load(); } });
        pager.querySelector('#pNext')?.addEventListener('click', () => { if (st.page < totalPages) { st.page++; load(); } });
      }

      let t;
      const debounce = (fn) => { clearTimeout(t); t = setTimeout(fn, 250); };
      root.querySelector('#cQ')?.addEventListener('input', (e) => debounce(() => { st.q = e.target.value.trim(); st.page = 1; load(); }));
      root.querySelector('#cPol')?.addEventListener('input', (e) => debounce(() => { st.policy = e.target.value.trim(); st.page = 1; load(); }));
      root.querySelector('#cProd')?.addEventListener('change', (e) => { st.product = e.target.value; st.page = 1; load(); });
      root.querySelector('#cSort')?.addEventListener('change', (e) => { st.sort = e.target.value; st.page = 1; load(); });
      root.querySelector('#cDir')?.addEventListener('change', (e) => { st.dir = e.target.value; st.page = 1; load(); });
      root.querySelector('#cSize')?.addEventListener('change', (e) => { st.pageSize = Number(e.target.value); st.page = 1; load(); });
      load();
    },
  };
}

export async function renderClientDetail(id) {
  const d = await api.get('/clients/' + id);
  const c = d.client;

  const tlColor = { alta: 'green', baja: 'red', siniestro: 'purple', cotizacion: 'orange', contacto: 'blue' };
  const timeline = d.timeline.length ? d.timeline.map((t) => `
    <div class="tl-item ${tlColor[t.type] || ''}">
      <div class="tl-text">${esc(t.text)}</div>
      <div class="tl-meta">${esc(t.user_name || 'Sistema')} &middot; ${fmtDateTime(t.created_at)}</div>
    </div>`).join('') : '<div class="empty">Sin actividad registrada</div>';

  const policies = d.policies.length ? d.policies.map((p) => `
    <div class="row between" style="padding:9px 0;border-bottom:1px solid #f0f2f6">
      <div><b>${esc(p.branch)}</b> <span class="muted">${esc(p.company || '')}</span>${p.policy_number ? ` <span class="muted">N° ${esc(p.policy_number)}</span>` : ''} ${p.status === 'baja' ? '<span class="badge red">Baja</span>' : '<span class="badge green">Vigente</span>'}</div>
      <div class="muted">${fmtMoney(p.premium)}</div>
    </div>`).join('') : '<div class="empty">Sin productos contratados</div>';

  const missing = d.missing.length ? d.missing.map((b) => `<button class="badge orange" data-offer="${esc(b)}" style="border:none;cursor:pointer">+ ${esc(b)}</button>`).join(' ') : '<span class="muted">Tiene todos los ramos</span>';

  const claims = d.claims.length ? d.claims.map((cl) => `
    <div class="row between clickable" data-claim="${cl.id}" style="padding:9px 0;border-bottom:1px solid #f0f2f6;cursor:pointer">
      <div><b>${esc(cl.type)}</b> <span class="muted">${fmtDateTime(cl.created_at)}</span></div>
      ${badge(cl.status)}
    </div>`).join('') : '<div class="empty">Sin siniestros</div>';

  const html = `
    <a href="#/clientes" class="muted" style="font-size:13px">&larr; Volver a clientes</a>
    <div class="grid cols-2" style="margin-top:12px;align-items:start">
      <div class="grid" style="gap:16px">
        <div class="card pad">
          <div class="row between">
            <div class="row" style="gap:12px">
              <div class="avatar" style="width:48px;height:48px;font-size:17px">${esc(c.name[0])}</div>
              <div><h2 style="font-size:19px">${esc(c.name)}</h2><div class="muted" style="font-size:13px">${esc(c.email || 'sin email')} &middot; ${esc(c.phone || 'sin teléfono')}</div></div>
            </div>
            <button type="button" class="btn ghost sm" id="editClient">Editar</button>
          </div>
          <div style="margin-top:12px">${(c.tags || '').split(',').filter(Boolean).map((t) => `<span class="chip">${esc(t.trim())}</span>`).join('') || ''}</div>
          ${c.observations ? `<div style="margin-top:10px;font-size:13px;background:#f7f9fc;padding:10px 12px;border-radius:10px">${esc(c.observations)}</div>` : ''}
        </div>
        <div class="card pad">
          <h3 style="font-size:14px;margin-bottom:10px">Productos / Pólizas</h3>
          ${policies}
          <div style="margin-top:12px"><div class="muted" style="font-size:12px;margin-bottom:6px">Oportunidades (ramos faltantes):</div>${missing}</div>
        </div>
        <div class="card pad">
          <h3 style="font-size:14px;margin-bottom:10px">Siniestros</h3>${claims}
        </div>
      </div>
      <div class="card pad">
        <div class="row between" style="margin-bottom:14px"><h3 style="font-size:14px">Historial de actividad</h3><button type="button" class="btn ghost sm" id="addObs">+ Observacion</button></div>
        <div class="timeline">${timeline}</div>
      </div>
    </div>`;

  return {
    html,
    mount: (root) => {
      const eb = root.querySelector('#editClient');
      if (eb) eb.addEventListener('click', () => openEditClientModal(c));
      const ob = root.querySelector('#addObs');
      if (ob) ob.addEventListener('click', () => {
        openModal({
          title: 'Agregar observacion',
          body: '<div class="field"><textarea id="obsT" rows="3" placeholder="Escribi la observacion..."></textarea></div>',
          footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="saveObs">Guardar</button>',
          onMount: (modal, close) => {
            modal.querySelector('#saveObs').addEventListener('click', async () => {
              const text = modal.querySelector('#obsT').value.trim();
              if (!text) return;
              await api.post('/clients/' + id + '/observation', { text });
              toast('Observacion agregada', 'green'); close(); reRender();
            });
          },
        });
      });
      root.querySelectorAll('[data-offer]').forEach((btn) => btn.addEventListener('click', () => openAltaModal(c, btn.dataset.offer)));
      root.querySelectorAll('[data-claim]').forEach((el) => el.addEventListener('click', () => go('#/siniestros/' + el.dataset.claim)));
    },
  };
}

// Registrar alta rapida desde el perfil del cliente.
function openAltaModal(client, branch) {
  const branches = (state.branches && state.branches.length) ? state.branches : ['Auto', 'Hogar', 'Vida', 'Salud', 'AP', 'Comercio', 'Caucion', 'ART'];
  openModal({
    title: `Registrar alta - ${client.name}`,
    body: `<form id="altaForm"><div class="form-grid">
      <div class="field"><label>Ramo</label><select name="branch">${branches.map((b) => `<option ${b === branch ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></div>
      <div class="field"><label>Compania</label><input name="company" /></div>
      <div class="field"><label>N° Póliza</label><input name="policy_number" /></div>
      <div class="field"><label>Prima mensual</label><input name="premium" type="number" value="0" /></div>
      <div class="field"><label>Comisión estimada</label><input name="commission" type="number" value="0" /></div>
    </div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn green" id="saveAlta">Registrar alta</button>',
    onMount: (modal, close) => {
      modal.querySelector('#saveAlta').addEventListener('click', async () => {
        const body = { client_id: client.id, type: 'alta', ...Object.fromEntries(new FormData(modal.querySelector('#altaForm')).entries()) };
        try {
          const r = await api.post('/movements', body);
          toast(r.status === 'pendiente' ? 'Alta registrada (pendiente de aprobación)' : 'Alta registrada', 'green');
          close(); reRender();
        } catch (e) { toast(e.message, 'red'); }
      });
    },
  });
}
