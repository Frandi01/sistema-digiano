import { api } from '../api.js';
import { esc, fmtMoney, toast, openModal, badge } from '../ui.js';
import { state, lineChart } from '../app.js';

const STATUS = { borrador: ['gray', 'Borrador'], calculado: ['blue', 'Calculado'], cerrado: ['orange', 'Cerrado'], pagado: ['green', 'Pagado'] };
function st(s) { const m = STATUS[s] || ['gray', s]; return `<span class="badge ${m[0]}">${m[1]}</span>`; }
const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export async function renderCommissionsAdmin() {
  const { periods } = await api.get('/commissions');
  const { series } = await api.get('/commissions/evolution');

  const chart = series.length ? lineChart(series, {
    keys: [
      { field: 'computable', color: '#2e75b6', label: 'Comisión computable (sin aguinaldo)' },
      { field: 'real_cobrada', color: '#27ae60', label: 'Comisión real cobrada' },
    ],
  }) : '<div class="empty">Carga liquidaciones para ver la evolucion</div>';

  const rows = periods.map((p) => `
    <tr class="clickable" data-id="${p.id}">
      <td><b>${esc(p.period)}</b></td>
      <td>${fmtMoney(p.transferido)}</td>
      <td>${fmtMoney(p.base)}</td>
      <td>${st(p.status)}</td>
      <td><button class="btn outline sm" data-del="${p.id}">Borrar</button></td>
    </tr>`).join('');

  const html = `
    <div class="card pad" style="margin-bottom:16px">
      <div class="row between" style="margin-bottom:10px"><h3 style="font-size:15px">Evolución de comisiones</h3>
        <button class="btn ghost sm no-print" onclick="window.print()">Exportar PDF</button></div>
      ${chart}
      <div class="muted" style="font-size:12px;margin-top:6px">La curva azul (computable) excluye aguinaldos / ingresos extraordinarios para ver el crecimiento real de cartera.</div>
    </div>
    <div class="card table-card">
      <div class="table-head between"><h3 style="font-size:15px">Liquidaciones por periodo</h3><button class="btn" id="newCom">+ Nueva liquidacion</button></div>
      <table><thead><tr><th>Periodo</th><th>Transferido</th><th>Neto a repartir</th><th>Estado</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5"><div class="empty">Sin liquidaciones</div></td></tr>'}</tbody></table>
    </div>`;

  return {
    html,
    mount: (root) => {
      root.querySelector('#newCom').onclick = () => openCommissionForm();
      root.querySelectorAll('tr[data-id]').forEach((tr) => tr.onclick = (e) => {
        if (e.target.closest('[data-del]')) return;
        openCommissionDetail(tr.dataset.id);
      });
      root.querySelectorAll('[data-del]').forEach((b) => b.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm('Borrar esta liquidacion definitivamente?')) return;
        try { await api.del('/commissions/' + b.dataset.del); toast('Liquidacion borrada', 'green'); refresh(); }
        catch (er) { toast(er.message, 'red'); }
      });
    },
  };
}

function num(v) { return v === '' || v == null ? 0 : Number(v); }

function openCommissionForm(existing) {
  const p = existing || {};
  const body = `<form id="comForm">
    <div class="form-grid">
      <div class="field"><label>Periodo (YYYY-MM) *</label><input name="period" value="${esc(p.period || '')}" placeholder="2026-06" ${existing ? 'readonly' : ''} required /></div>
      <div class="field"><label>Suma 1 (pago 1)</label><input name="suma1" type="number" value="${p.suma1 ?? 0}" /></div>
      <div class="field"><label>Suma 2 (pago 2)</label><input name="suma2" type="number" value="${p.suma2 ?? 0}" /></div>
      <div class="field"><label>Suma 3 (pago 3)</label><input name="suma3" type="number" value="${p.suma3 ?? 0}" /></div>
      <div class="field"><label>Aguinaldo / extraordinario</label><input name="extraordinario" type="number" value="${p.extraordinario ?? 0}" /></div>
    </div>
    <details style="margin-top:8px"><summary class="muted" style="cursor:pointer;font-size:13px">Gastos y porcentajes (avanzado)</summary>
    <div class="form-grid" style="margin-top:10px">
      <div class="field"><label>Marketing</label><input name="marketing" type="number" value="${p.marketing ?? 0}" /></div>
      <div class="field"><label>Gastos varios</label><input name="gastos_varios" type="number" value="${p.gastos_varios ?? 0}" /></div>
      <div class="field"><label>Rubrica digital</label><input name="c_rubrica" type="number" value="${p.c_rubrica ?? 15000}" /></div>
      <div class="field"><label>Contador</label><input name="c_contador" type="number" value="${p.c_contador ?? 50000}" /></div>
      <div class="field"><label>Monotributo</label><input name="c_monotributo" type="number" value="${p.c_monotributo ?? 285678.23}" /></div>
      <div class="field"><label>Luciano fijo</label><input name="c_luciano_fijo" type="number" value="${p.c_luciano_fijo ?? 100000}" /></div>
      <div class="field"><label>Reserva (% transferido)</label><input name="reserva_pct" type="number" step="0.01" value="${p.reserva_pct ?? 0.05}" /></div>
      <div class="field"><label>% Fernando</label><input name="pct_fernando" type="number" step="0.01" value="${p.pct_fernando ?? 0.45}" /></div>
      <div class="field"><label>% Natalia</label><input name="pct_natalia" type="number" step="0.01" value="${p.pct_natalia ?? 0.15}" /></div>
      <div class="field"><label>% Grupo (Franco+Luciano)</label><input name="pct_grupo" type="number" step="0.01" value="${p.pct_grupo ?? 0.40}" /></div>
      <div class="field"><label>Factor Luciano (parte del grupo)</label><input name="factor_luciano" type="number" step="0.01" value="${p.factor_luciano ?? 0.17}" /></div>
    </div></details>
  </form>`;
  openModal({
    title: existing ? 'Editar liquidacion ' + p.period : 'Nueva liquidacion', wide: true, body,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="saveCom">Guardar</button>',
    onMount: (modal, close) => {
      modal.querySelector('#saveCom').onclick = async () => {
        const f = new FormData(modal.querySelector('#comForm'));
        const o = Object.fromEntries(f.entries());
        ['suma1', 'suma2', 'suma3', 'marketing', 'gastos_varios', 'c_rubrica', 'c_contador', 'c_monotributo', 'c_luciano_fijo', 'reserva_pct', 'pct_fernando', 'pct_natalia', 'pct_grupo', 'factor_luciano', 'extraordinario'].forEach((k) => o[k] = num(o[k]));
        try {
          if (existing) await api.put('/commissions/' + existing.id, o);
          else await api.post('/commissions', o);
          toast('Liquidacion guardada', 'green'); close(); refresh();
        } catch (e) { toast(e.message, 'red'); }
      };
    },
  });
}

async function openCommissionDetail(id) {
  const d = await api.get('/commissions/' + id);
  const p = d.period; const c = d.calc;
  const lines = d.lines.map((l) => `<div class="com-line"><b>${esc(l.person)}</b><span class="com-amt">${fmtMoney(l.amount)}</span></div>`).join('');
  const locked = p.status === 'cerrado' || p.status === 'pagado';
  const body = `
    <div class="row between" style="margin-bottom:10px"><div>${st(p.status)}</div>
      <div class="muted" style="font-size:12px">Transferido ${fmtMoney(c.transferido)} &middot; Gastos ${fmtMoney(c.gastos)} &middot; Reserva ${fmtMoney(c.reserva)}</div></div>
    <div class="card" style="margin-bottom:12px"><div class="row between" style="padding:12px 14px;background:#f7f9fc"><b>Neto a repartir</b><span class="com-amt">${fmtMoney(c.base)}</span></div>${lines}</div>
    <div class="muted" style="font-size:12px">Computable (sin aguinaldo): <b>${fmtMoney(c.computable)}</b> &middot; Aguinaldo/extra: ${fmtMoney(c.extraordinario)}</div>`;
  const stateBtns = ['calculado', 'cerrado', 'pagado'].map((s) => `<button class="btn outline sm" data-st="${s}" ${p.status === s ? 'disabled' : ''}>${STATUS[s][1]}</button>`).join(' ');
  openModal({
    title: 'Liquidacion ' + p.period, wide: true, body,
    footer: `<div style="flex:1" class="row" style="gap:6px">${stateBtns}</div>${locked ? '' : '<button class="btn ghost" id="editCom">Editar</button>'}<button class="btn" data-close>Cerrar</button>`,
    onMount: (modal, close) => {
      const eb = modal.querySelector('#editCom');
      if (eb) eb.onclick = () => { close(); openCommissionForm(p); };
      modal.querySelectorAll('[data-st]').forEach((b) => b.onclick = async () => {
        try { await api.post('/commissions/' + id + '/status', { status: b.dataset.st }); toast('Estado actualizado', 'green'); close(); refresh(); }
        catch (e) { toast(e.message, 'red'); }
      });
    },
  });
}

// ---------- Vista del empleado: solo lo suyo ----------
export async function renderMyCommission() {
  const { items } = await api.get('/commissions/mine/list');
  const chrono = [...items].reverse();
  const total = items.reduce((s, i) => s + (i.amount || 0), 0);
  const chart = chrono.length >= 2 ? lineChart(chrono, { keys: [{ field: 'amount', color: '#2e75b6', label: 'Mi comisión' }] }) : '';
  const rows = items.map((i) => `
    <tr><td><b>${esc(i.period)}</b></td><td class="com-amt" style="font-size:14px">${fmtMoney(i.amount)}</td><td>${badge(i.status)}</td></tr>`).join('');
  const html = `
    <div class="card pad" style="background:linear-gradient(120deg,#1f3864,#2e75b6);color:#fff;margin-bottom:16px">
      <div class="muted" style="opacity:.85;font-size:13px">Total acumulado (periodos liquidados)</div>
      <h2 style="font-size:30px;color:#fff">${fmtMoney(total)}</h2>
    </div>
    ${chart ? `<div class="card pad" style="margin-bottom:16px"><h3 style="font-size:14px;margin-bottom:8px">Tu evolucion</h3>${chart}</div>` : ''}
    <div class="card table-card"><div class="table-head"><h3 style="font-size:15px">Mis comisiones por período</h3></div>
      <table><thead><tr><th>Periodo</th><th>Monto</th><th>Estado</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3"><div class="empty">Todavía no tenés comisiones liquidadas</div></td></tr>'}</tbody></table></div>`;
  return { html };
}
