import { api } from '../api.js';
import { esc, fmtDate, toast, openModal, icons } from '../ui.js';

const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export async function renderBrandLibrary() {
  const { links } = await api.get('/marketing/brand');
  const groups = {};
  links.forEach((l) => { (groups[l.category || 'General'] = groups[l.category || 'General'] || []).push(l); });
  const cats = Object.keys(groups).sort();
  const sections = cats.map((cat) => `
    <div class="card pad" style="margin-bottom:14px">
      <h3 style="font-size:14px;margin-bottom:8px">${esc(cat)}</h3>
      <div class="grid cols-2">
        ${groups[cat].map((l) => `
          <div class="row between" style="gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:8px">
            <div style="min-width:0">
              <a href="${esc(l.url)}" target="_blank" rel="noopener" style="font-weight:600;font-size:13.5px;word-break:break-word">${esc(l.title)}</a>
              <div class="muted" style="font-size:11px">${esc(l.author || '-')} &middot; ${fmtDate(l.created_at)}</div>
            </div>
            <button class="btn outline sm" data-del="${l.id}">Borrar</button>
          </div>`).join('')}
      </div>
    </div>`).join('');

  const html = `
    <div class="card pad" style="margin-bottom:14px">
      <div class="row between wrap">
        <div><h3 style="font-size:15px">Biblioteca de Marca</h3>
          <div class="muted" style="font-size:13px">Enlaces a logos, manuales, plantillas, paleta de colores y demas recursos de marca.</div></div>
        <button class="btn" id="newLink">${icons.plus} Nuevo enlace</button>
      </div>
    </div>
    ${sections || '<div class="empty">Todavía no hay enlaces. Agregá el primero.</div>'}`;

  return {
    html,
    mount: (root) => {
      root.querySelector('#newLink').addEventListener('click', () => linkForm());
      root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Borrar este enlace?')) return;
        try { await api.del('/marketing/brand/' + b.dataset.del); toast('Enlace borrado'); refresh(); } catch (e) { toast(e.message, 'red'); }
      }));
    },
  };
}

function linkForm() {
  openModal({
    title: 'Nuevo enlace de marca',
    body: `<form id="lf"><div class="form-grid">
      <div class="field full"><label>Titulo *</label><input name="title" required placeholder="Ej: Logo principal (PNG)" /></div>
      <div class="field full"><label>Enlace (URL) *</label><input name="url" required placeholder="https://..." /></div>
      <div class="field full"><label>Categoria</label><input name="category" placeholder="Logos / Plantillas / Manual de marca / Colores" /></div>
    </div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="ls">Guardar</button>',
    onMount: (modal, close) => {
      modal.querySelector('#ls').addEventListener('click', async () => {
        const fd = Object.fromEntries(new FormData(modal.querySelector('#lf')).entries());
        if (!fd.title || !fd.url) return toast('Falta titulo o enlace', 'red');
        try { await api.post('/marketing/brand', fd); toast('Enlace guardado', 'green'); close(); refresh(); }
        catch (e) { toast(e.message, 'red'); }
      });
    },
  });
}
