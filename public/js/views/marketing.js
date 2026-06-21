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
    const statusBadge = (s) => s === 'completado' ? '<span class="badge green">Completado</span>' : s === 'en_progreso' ? '<span class="badge orange">En progreso</span>' : '<span class="badge gray">Pendiente</span>';
    const rows = tasks.map((t) => `
      <tr>
        <td><b>${esc(t.type)}</b>${t.description ? `<br><span class="muted" style="font-size:12px">${esc(t.description)}</span>` : ''}</td>
        <td>${t.due_date ? fmtDate(t.due_date) : '<span class="muted">—</span>'}</td>
        <td>${statusBadge(t.status)}</td>
        <td>${t.result_notes ? `<span class="muted" style="font-size:12px">${esc(t.result_notes)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="row" style="gap:6px">
          ${t.status !== 'completado' ? `<button class="btn outline sm" data-upd="${t.id}">Actualizar</button>` : ''}
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
              <option value="en_progreso" ${task.status === 'en_progreso' ? 'selected' : ''}>En progreso</option>
              <option value="completado" ${task.status === 'completado' ? 'selected' : ''}>Completado</option>
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

  const html = `
    <div class="card pad" style="margin-bottom:18px">
      <h3 style="font-size:15px;margin-bottom:4px">Panel de Marketing</h3>
      <div class="muted" style="font-size:13px">Calendario de contenido y tareas asignadas.</div>
    </div>
    <div class="card pad" style="margin-bottom:18px" id="calContainer">
      <div class="empty">Cargando calendario...</div>
    </div>
    <div id="tasksContainer"><div class="empty">Cargando tareas...</div></div>`;

  return {
    html,
    mount: async (root) => {
      await Promise.all([buildCalendar(root), buildTasks(root)]);
    },
  };
}
