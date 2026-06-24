import { api } from '../api.js';
import { icons, esc, fmtDate, toast, openModal } from '../ui.js';
import { state } from '../app.js';

// Fechas clave de Argentina (mes base-0, dia)
const FECHAS_CLAVE = {
  '01-01': 'Año Nuevo',
  '02-14': 'San Valentín',
  '03-08': 'Día de la Mujer',
  '04-02': 'Día del Veterano',
  '05-01': 'Día del Trabajador',
  '05-25': 'Revolución de Mayo',
  '06-16': 'Día del Seguro',
  '06-20': 'Día de la Bandera',
  '07-09': 'Independencia Argentina',
  '07-20': 'Día de la Amistad',
  '10-31': 'Halloween',
  '12-25': 'Navidad',
  '12-31': 'Fin de Año',
};

// Fechas variables (tercer domingo): se calculan por año
function tercerDomingo(year, month) { // month 0-based
  let d = new Date(year, month, 1);
  let sundays = 0;
  while (sundays < 3) {
    if (d.getDay() === 0) sundays++;
    if (sundays < 3) d.setDate(d.getDate() + 1);
  }
  return d.getDate();
}
function fechasVariables(year) {
  return {
    [`06-${String(tercerDomingo(year, 5)).padStart(2, '0')}`]: 'Día del Padre',
    [`08-${String(tercerDomingo(year, 7)).padStart(2, '0')}`]: 'Día del Niño',
    [`10-${String(tercerDomingo(year, 9)).padStart(2, '0')}`]: 'Día de la Madre',
  };
}

const TASK_TYPES = [
  'Subir contenido a Instagram/Facebook',
  'Subir estado de WhatsApp',
  'Revisar rendimiento de publicaciones',
  'Cargar resultados de campaña',
  'Tarea personalizada',
];

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

export async function renderMarketing() {
  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth(); // 0-based

  async function buildCalendar(root) {
    const year = viewYear;
    const month = viewMonth;
    const apiMonth = month + 1;
    const { notes } = await api.get(`/marketing/calendar/${year}/${apiMonth}`);

    // Agrupar notas por fecha
    const notesByDate = {};
    for (const n of notes) {
      if (!notesByDate[n.date]) notesByDate[n.date] = [];
      notesByDate[n.date].push(n);
    }

    const variables = fechasVariables(year);
    const allKeys = { ...FECHAS_CLAVE, ...variables };

    const firstDay = new Date(year, month, 1).getDay(); // 0=dom
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const todayStr = now.toISOString().slice(0, 10);

    let cells = '';
    // Encabezado días
    for (const d of ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']) {
      cells += `<div class="cal-head">${d}</div>`;
    }
    // Celdas vacías iniciales
    for (let i = 0; i < firstDay; i++) cells += '<div class="cal-cell empty"></div>';

    for (let day = 1; day <= daysInMonth; day++) {
      const mm = String(apiMonth).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      const dateStr = `${year}-${mm}-${dd}`;
      const keyStr = `${mm}-${dd}`;
      const esFechaClave = allKeys[keyStr];
      const dayNotes = notesByDate[dateStr] || [];
      const isToday = dateStr === todayStr;

      cells += `<div class="cal-cell${isToday ? ' today' : ''}${esFechaClave ? ' fecha-clave' : ''}" data-date="${dateStr}">
        <div class="cal-day-num">${day}</div>
        ${esFechaClave ? `<div class="cal-event-label" title="${esc(esFechaClave)}">${esc(esFechaClave)}</div>` : ''}
        ${dayNotes.map((n) => `<div class="cal-note" data-note-id="${n.id}" title="${esc(n.text)}">${esc(n.text.length > 30 ? n.text.slice(0, 30) + '…' : n.text)}<span class="cal-note-del" data-del-note="${n.id}">×</span></div>`).join('')}
        <div class="cal-add-btn" data-add-note="${dateStr}">+</div>
      </div>`;
    }

    const calHtml = `
      <div class="cal-nav row between" style="margin-bottom:12px;align-items:center">
        <button class="btn outline sm" id="calPrev">${icons.chevronLeft || '‹'} Anterior</button>
        <h3 style="font-size:16px;font-weight:700">${MONTH_NAMES[month]} ${year}</h3>
        <button class="btn outline sm" id="calNext">Siguiente ${icons.chevronRight || '›'}</button>
      </div>
      <div class="cal-grid">${cells}</div>`;

    const calContainer = root.querySelector('#calContainer');
    calContainer.innerHTML = calHtml;

    calContainer.querySelector('#calPrev').onclick = () => {
      viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      buildCalendar(root);
    };
    calContainer.querySelector('#calNext').onclick = () => {
      viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      buildCalendar(root);
    };

    // Agregar nota
    calContainer.querySelectorAll('[data-add-note]').forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const date = btn.dataset.addNote;
        openModal({
          title: `Anotación — ${fmtDate(date)}`,
          body: `<form id="nf"><div class="field"><label>Anotación</label><textarea name="text" rows="3" placeholder="Ej: Publicar promo Hogar" required></textarea></div></form>`,
          footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="ns">Guardar</button>',
          onMount: (modal, close) => modal.querySelector('#ns').onclick = async () => {
            const text = modal.querySelector('[name=text]').value.trim();
            if (!text) return;
            try { await api.post('/marketing/calendar', { date, text }); close(); buildCalendar(root); toast('Anotación guardada', 'green'); }
            catch (er) { toast(er.message, 'red'); }
          },
        });
      };
    });

    // Eliminar nota
    calContainer.querySelectorAll('[data-del-note]').forEach((btn) => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm('¿Eliminar esta anotación?')) return;
        try { await api.del('/marketing/calendar/' + btn.dataset.delNote); buildCalendar(root); }
        catch (er) { toast(er.message, 'red'); }
      };
    });
  }

  async function buildTasks(root) {
    const { tasks } = await api.get('/marketing/tasks');
    const statusBadge = (s) => s === 'completada' ? '<span class="badge green">Completada</span>' : s === 'en_proceso' ? '<span class="badge orange">En proceso</span>' : '<span class="badge gray">Pendiente</span>';
    const rows = tasks.map((t) => `
      <tr>
        <td><b>${esc(t.type)}</b>${t.description ? `<br><span class="muted" style="font-size:12px">${esc(t.description)}</span>` : ''}</td>
        <td>${t.due_date ? fmtDate(t.due_date) : '<span class="muted">—</span>'}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${t.result_notes ? `<span class="muted" style="font-size:12px">${esc(t.result_notes)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="row" style="gap:6px">
          ${t.status !== 'completada' ? `<button class="btn outline sm" data-upd="${t.id}">Actualizar</button>` : ''}
          ${state.user.role === 'admin' ? `<button class="btn outline sm red" data-del-task="${t.id}">Borrar</button>` : ''}
        </td>
      </tr>`).join('');

    const tasksContainer = root.querySelector('#tasksContainer');
    tasksContainer.innerHTML = `
      <div class="card table-card">
        <div class="table-head between">
          <h3 style="font-size:15px">Tareas de marketing</h3>
          ${state.user.role === 'admin' ? `<button class="btn" id="newMktTask">${icons.plus} Nueva tarea</button>` : ''}
        </div>
        <table><thead><tr><th>Tarea</th><th>Vence</th><th>Estado</th><th>Resultado</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5"><div class="empty">Sin tareas</div></td></tr>'}</tbody></table>
      </div>`;

    const newMktTaskBtn = tasksContainer.querySelector('#newMktTask');
    if (newMktTaskBtn) newMktTaskBtn.onclick = () => openModal({
      title: 'Nueva tarea de marketing',
      body: `<form id="tf"><div class="form-grid">
        <div class="field full"><label>Tipo *</label>
          <select name="type" id="typeSelect">
            ${TASK_TYPES.map((t) => `<option>${esc(t)}</option>`).join('')}
          </select>
        </div>
        <div class="field full" id="customWrap" style="display:none"><label>Descripción personalizada</label><input name="custom_type" placeholder="Ej: Grabar video para reel" /></div>
        <div class="field full"><label>Descripción adicional</label><textarea name="description" rows="2"></textarea></div>
        <div class="field"><label>Fecha límite</label><input name="due_date" type="date" /></div>
      </div></form>`,
      footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="ts">Crear</button>',
      onMount: (modal, close) => {
        modal.querySelector('#typeSelect').onchange = (e) => {
          modal.querySelector('#customWrap').style.display = e.target.value === 'Tarea personalizada' ? 'block' : 'none';
        };
        modal.querySelector('#ts').onclick = async () => {
          const fd = new FormData(modal.querySelector('#tf'));
          let type = fd.get('type');
          if (type === 'Tarea personalizada') type = fd.get('custom_type') || 'Tarea personalizada';
          try {
            await api.post('/marketing/tasks', { type, description: fd.get('description'), due_date: fd.get('due_date') });
            toast('Tarea creada', 'green'); close(); buildTasks(root);
          } catch (er) { toast(er.message, 'red'); }
        };
      },
    });

    tasksContainer.querySelectorAll('[data-upd]').forEach((btn) => btn.onclick = () => {
      const task = tasks.find((t) => t.id == btn.dataset.upd);
      openModal({
        title: 'Actualizar tarea',
        body: `<form id="uf"><div class="form-grid">
          <div class="field full"><label>Estado</label>
            <select name="status">
              <option value="pendiente" ${task.status === 'pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="en_proceso" ${task.status === 'en_proceso' ? 'selected' : ''}>En proceso</option>
              <option value="completada" ${task.status === 'completada' ? 'selected' : ''}>Completada</option>
            </select>
          </div>
          <div class="field full"><label>Notas de resultado</label><textarea name="result_notes" rows="3">${esc(task.result_notes || '')}</textarea></div>
        </div></form>`,
        footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="us">Guardar</button>',
        onMount: (modal, close) => modal.querySelector('#us').onclick = async () => {
          const fd = new FormData(modal.querySelector('#uf'));
          try {
            await api.put('/marketing/tasks/' + task.id, { status: fd.get('status'), result_notes: fd.get('result_notes') });
            toast('Actualizado', 'green'); close(); buildTasks(root);
          } catch (er) { toast(er.message, 'red'); }
        },
      });
    });
  }

  async function buildPipeline(root) {
    const { items } = await api.get('/marketing/content');
    let campaigns = [];
    try { campaigns = (await api.get('/objectives')).objectives.filter((c) => c.active); } catch (e) { console.warn('objectives (combo)', e); }
    const byStatus = {}; PIPE.forEach(([k]) => (byStatus[k] = []));
    items.forEach((it) => (byStatus[it.status] || byStatus.idea).push(it));
    const card = (it) => `
      <div class="kb-card" draggable="true" data-id="${it.id}">
        <div class="kb-title">${esc(it.title)}</div>
        ${it.campaign_name ? `<div class="kb-camp">🎯 ${esc(it.campaign_name)}</div>` : ''}
        ${it.format ? `<span class="badge gray" style="margin-top:4px">${esc(it.format)}</span>` : ''}
        ${it.status === 'pendiente_metricas' ? '<span class="badge orange" style="margin-top:4px">Pend. metricas</span>' : ''}
        ${it.status === 'publicado' && it.metrics_views != null ? `<div class="muted" style="font-size:11px;margin-top:4px">${it.metrics_views} vistas &middot; ${it.metrics_likes || 0} likes</div>` : ''}
        ${['programado', 'publicado', 'pendiente_metricas'].includes(it.status) ? `<button class="btn outline sm kb-metric" data-metric="${it.id}" style="margin-top:6px;width:100%">${it.status === 'publicado' ? 'Editar metricas' : 'Cargar metricas'}</button>` : ''}
        <span class="kb-del" data-del-c="${it.id}" title="Archivar">×</span>
      </div>`;
    const cols = PIPE.map(([k, label]) => `
      <div class="kb-col" data-status="${k}">
        <div class="kb-col-head">${label} <span class="kb-count">${byStatus[k].length}</span></div>
        <div class="kb-col-body">${byStatus[k].map(card).join('')}</div>
      </div>`).join('');
    const cont = root.querySelector('#pipeContainer');
    cont.innerHTML = `
      <div class="card pad">
        <div class="row between" style="margin-bottom:10px">
          <h3 style="font-size:15px">Pipeline de contenido</h3>
          <button class="btn" id="newContent">${icons.plus} Nuevo contenido</button>
        </div>
        <div class="muted" style="font-size:12px;margin-bottom:10px">Arrastra las tarjetas entre columnas para cambiar su estado.</div>
        <div class="kanban">${cols}</div>
      </div>`;
    cont.querySelector('#newContent').onclick = () => openContentModal(campaigns, root);
    cont.querySelectorAll('[data-del-c]').forEach((b) => b.onclick = async (e) => {
      e.stopPropagation(); if (!confirm('Archivar este contenido?')) return;
      try { await api.del('/marketing/content/' + b.dataset.delC); buildPipeline(root); } catch (er) { toast(er.message, 'red'); }
    });
    cont.querySelectorAll('[data-metric]').forEach((b) => b.onclick = (e) => {
      e.stopPropagation(); openCloseModal(items.find((x) => x.id == b.dataset.metric), root);
    });
    cont.querySelectorAll('.kb-card').forEach((el) => {
      el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', el.dataset.id); el.classList.add('dragging'); });
      el.addEventListener('dragend', () => el.classList.remove('dragging'));
    });
    cont.querySelectorAll('.kb-col').forEach((col) => {
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
      col.addEventListener('dragleave', () => col.classList.remove('drop'));
      col.addEventListener('drop', async (e) => {
        e.preventDefault(); col.classList.remove('drop');
        const id = e.dataTransfer.getData('text/plain');
        try { await api.put('/marketing/content/' + id, { status: col.dataset.status }); buildPipeline(root); }
        catch (er) { toast(er.message, 'red'); }
      });
    });
  }

  function openContentModal(campaigns, root) {
    openModal({
      title: 'Nuevo contenido',
      body: `<form id="cf"><div class="form-grid">
        <div class="field full"><label>Titulo *</label><input name="title" required /></div>
        <div class="field"><label>Formato</label><select name="format"><option value="">-</option><option>Reel</option><option>Carrusel</option><option>Historia</option><option>Post</option><option>Video</option></select></div>
        <div class="field"><label>Campaña</label><select name="campaign_id"><option value="">Sin campaña</option>${campaigns.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
        <div class="field full"><label>Descripcion / guion</label><textarea name="description" rows="2"></textarea></div>
      </div></form>`,
      footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="cs">Crear</button>',
      onMount: (modal, close) => modal.querySelector('#cs').onclick = async () => {
        const fd = Object.fromEntries(new FormData(modal.querySelector('#cf')).entries());
        if (!fd.title) return toast('Falta el titulo', 'red');
        try { await api.post('/marketing/content', fd); toast('Contenido creado', 'green'); close(); buildPipeline(root); }
        catch (e) { toast(e.message, 'red'); }
      },
    });
  }

  function openCloseModal(it, root) {
    if (!it) return;
    const m = (v) => (v == null ? '' : v);
    openModal({
      title: 'Cerrar publicacion / metricas',
      body: `<form id="mf">
        <div class="muted" style="font-size:12.5px;margin-bottom:8px"><b>${esc(it.title)}</b>. Carga las metricas reales. Si las dejas vacias, el contenido queda en <b>Pendiente de metricas</b> y se crea una tarea de seguimiento a 48h.</div>
        <div class="form-grid">
          <div class="field"><label>Visualizaciones</label><input name="views" type="number" min="0" value="${m(it.metrics_views)}" /></div>
          <div class="field"><label>Alcance</label><input name="reach" type="number" min="0" value="${m(it.metrics_reach)}" /></div>
          <div class="field"><label>Likes</label><input name="likes" type="number" min="0" value="${m(it.metrics_likes)}" /></div>
          <div class="field"><label>Comentarios</label><input name="comments" type="number" min="0" value="${m(it.metrics_comments)}" /></div>
        </div></form>`,
      footer: '<button class="btn ghost" data-close>Cancelar</button><button class="btn" id="mcs">Guardar</button>',
      onMount: (modal, close) => {
        modal.querySelector('#mcs').addEventListener('click', async () => {
          const fd = Object.fromEntries(new FormData(modal.querySelector('#mf')).entries());
          try {
            const r = await api.post('/marketing/content/' + it.id + '/close', fd);
            toast(r.pending ? 'Cerrada sin metricas (tarea a 48h creada)' : 'Metricas guardadas', 'green');
            close(); buildPipeline(root); buildMktDashboard(root);
          } catch (e) { toast(e.message, 'red'); }
        });
      },
    });
  }

  async function buildMktDashboard(root) {
    let d; try { d = await api.get('/marketing/dashboard'); } catch (e) { return; }
    const t = d.totals || {};
    const kpi = (label, val, color) => `<div class="card pad" style="flex:1;text-align:center;min-width:104px"><div style="font-size:22px;font-weight:700;color:${color || 'var(--navy)'}">${val ?? 0}</div><div class="muted" style="font-size:11px">${label}</div></div>`;
    const camps = (d.byCampaign || []).map((c) => `<tr><td>${esc(c.name)}</td><td>${c.contenidos}</td><td>${c.publicados}</td><td>${c.views}</td></tr>`).join('');
    const cont = root.querySelector('#mktDashContainer');
    if (!cont) return;
    cont.innerHTML = `
      <div class="card pad">
        <h3 style="font-size:15px;margin-bottom:10px">Resultados de Marketing</h3>
        <div class="row wrap" style="gap:10px;margin-bottom:12px">
          ${kpi('Contenidos', t.total)}
          ${kpi('Publicados', t.publicados, '#27ae60')}
          ${kpi('Pend. metricas', t.pendientes_metricas, '#e67e22')}
          ${kpi('Visualizaciones', t.views, '#2e75b6')}
          ${kpi('Alcance', t.reach, '#2e75b6')}
          ${kpi('Likes', t.likes, '#8e44ad')}
        </div>
        ${camps ? `<table style="width:100%"><thead><tr><th>Campaña</th><th>Contenidos</th><th>Publicados</th><th>Vistas</th></tr></thead><tbody>${camps}</tbody></table>` : '<div class="muted" style="font-size:12.5px">Aún no hay contenido vinculado a campañas.</div>'}
      </div>`;
  }

  const html = `
    <div class="card pad" style="margin-bottom:18px">
      <h3 style="font-size:15px;margin-bottom:4px">Panel de Marketing</h3>
      <div class="muted" style="font-size:13px">Pipeline de contenido, calendario y tareas.</div>
    </div>
    <div id="mktDashContainer" style="margin-bottom:18px"></div>
    <div id="pipeContainer" style="margin-bottom:18px"><div class="empty">Cargando pipeline...</div></div>
    <div class="card pad" style="margin-bottom:18px" id="calContainer">
      <div class="empty">Cargando calendario...</div>
    </div>
    <div id="tasksContainer"><div class="empty">Cargando tareas...</div></div>`;

  return {
    html,
    mount: async (root) => {
      await Promise.all([buildMktDashboard(root), buildPipeline(root), buildCalendar(root), buildTasks(root)]);
    },
  };
}

const PIPE = [['idea', 'Idea'], ['guion', 'Guion'], ['pend_grabar', 'Pend. grabar'], ['grabado', 'Grabado'], ['editando', 'Editando'], ['revision', 'Revision'], ['programado', 'Programado'], ['publicado', 'Publicado'], ['pendiente_metricas', 'Pend. metricas']];
