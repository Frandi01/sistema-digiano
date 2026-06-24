import { api } from '../api.js';
import { esc, fmtDate, toast, openModal, icons } from '../ui.js';

const refresh = () => window.dispatchEvent(new HashChangeEvent('hashchange'));

export async function renderBancoIdeas() {
  const { ideas } = await api.get('/marketing/ideas');
  const prio = (p) => `<span class="badge ${p === 'alta' ? 'red' : p === 'baja' ? 'gray' : 'orange'}">${esc(p || 'media')}</span>`;
  const cards = ideas.map((i) => `
    <div class="card pad idea-card">
      <div class="row between" style="gap:8px"><b style="font-size:15px">${esc(i.title)}</b>${prio(i.priority)}</div>
      ${i.objective ? `<div class="muted" style="font-size:12px;margin-top:3px">Objetivo: ${esc(i.objective)}</div>` : ''}
      ${i.description ? `<div style="font-size:13px;margin-top:6px;color:#45505f">${esc(i.description)}</div>` : ''}
      <div style="margin-top:8px">${(i.tags || '').split(',').filter(Boolean).map((t) => `<span class="chip">${esc(t.trim())}</span>`).join('')}</div>
      <div class="muted" style="font-size:11px;margin-top:8px">${esc(i.author || '-')} &middot; ${fmtDate(i.created_at)}</div>
      <div class="row wrap" style="gap:6px;margin-top:10px">
        <button class="btn sm" data-convert="${i.id}">Convertir en contenido</button>
        <button class="btn outline sm" data-edit="${i.id}">Editar</button>
        <button class="btn outline sm" data-del="${i.id}">Borrar</button>
      </div>
    </div>`).join('');

  const html = `
    <div class="card pad" style="margin-bottom:14px">
      <div class="row between wrap">
        <div><h3 style="font-size:15px">Banco de Ideas</h3>
          <div class="muted" style="font-size:13px">Guarda ideas de contenido. Convertilas al Pipeline cuando quieras producirlas.</div></div>
        <button class="btn" id="newIdea">${icons.plus} Nueva idea</button>
      </div>
    </div>
    <div class="grid cols-3">${cards || '<div class="empty">Sin ideas todavia. Crea la primera.</div>'}</div>`;

  return {
    html,
    mount: (root) => {
      root.querySelector('#newIdea').addEventListener('click', () => ideaForm());
      root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => ideaForm(ideas.find((i) => i.id == b.dataset.edit))));
      root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Borrar esta idea?')) return;
        try { await api.del('/marketing/ideas/' + b.dataset.del); toast('Idea borrada'); refresh(); } catch (e) { toast(e.message, 'red'); }
      }));
      root.querySelectorAll('[data-convert]').forEach((b) => b.addEventListener('click', async () => {
        try { await api.post('/marketing/ideas/' + b.dataset.convert + '/convert'); toast('Idea convertida en contenido (Pipeline)', 'green'); refresh(); }
        catch (e) { toast(e.message, 'red'); }
      }));
    },
  };
}

function ideaForm(idea) {
  const e = idea || {};
  openModal({
    title: idea ? 'Editar idea' : 'Nueva idea',
    body: `<form id="if"><div class="form-grid">
      <div class="field full"><label>Titulo *</label><input name="title" value="${esc(e.title || '')}" required /></div>
      <div class="field"><label>Prioridad</label><select name="priority"><option value="alta" ${e.priority === 'alta' ? 'selected' : ''}>Alta</option><option value="media" ${(e.priority || 'media') === 'media' ? 'selected' : ''}>Media</option><option value="baja" ${e.priority === 'baja' ? 'selected' : ''}>Baja</option></select></div>
      <div class="field"><label>Etiquetas (separadas por coma)</label><input name="tags" value="${esc(e.tags || '')}" placeholder="hogar, educativo" /></div>
      <div class="field full"><label>Objetivo</label><input name="objective" value="${esc(e.objective || '')}" placeholder="Ej: educar sobre seguro de hogar" /></div>
      <div class="field full"><label>Descripcion</label><textarea name="description" rows="3">${esc(e.description || '')}</textarea></div>
    </div></form>`,
    footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="is">Guardar</button>',
    onMount: (modal, close) => {
      modal.querySelector('#is').addEventListener('click', async () => {
        const fd = Object.fromEntries(new FormData(modal.querySelector('#if')).entries());
        if (!fd.title) return toast('Falta el titulo', 'red');
        try {
          if (idea) await api.put('/marketing/ideas/' + idea.id, fd); else await api.post('/marketing/ideas', fd);
          toast('Idea guardada', 'green'); close(); refresh();
        } catch (er) { toast(er.message, 'red'); }
      });
    },
  });
}
