// Integracion con IA (OpenAI). Lee la API key desde la variable de entorno
// OPENAI_API_KEY. Si no esta configurada, devuelve un aviso amable en lugar de
// romper. El modelo se puede cambiar con OPENAI_MODEL (por defecto gpt-4o-mini).
import express from './micro.js';
import db from './db.js';
import { requireAuth, requireRole } from './auth.js';
import { audit } from './helpers.js';

const router = express.Router();
const isStaff = requireRole('admin', 'marketing');
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function campaignContext(o) {
  const com = db.prepare(
    `SELECT COUNT(*) total,
       SUM(CASE WHEN result='venta_cerrada' THEN 1 ELSE 0 END) ventas,
       SUM(CASE WHEN result IN ('contactado','cotizacion_enviada','venta_cerrada','no_interesado') THEN 1 ELSE 0 END) contactados,
       SUM(CASE WHEN result IN ('cotizacion_enviada','venta_cerrada') THEN 1 ELSE 0 END) cotizaciones
     FROM tasks WHERE kind='comercial' AND COALESCE(deleted,0)=0 AND (campaign_id=? OR (? IS NOT NULL AND offer=?))`
  ).get(o.id, o.branch, o.branch);
  const pub = db.prepare(
    `SELECT COUNT(*) n, COALESCE(SUM(metrics_views),0) views, COALESCE(SUM(metrics_reach),0) reach,
       COALESCE(SUM(metrics_likes),0) likes, COALESCE(SUM(metrics_comments),0) comments
     FROM mkt_content WHERE campaign_id=? AND status='publicado'`
  ).get(o.id);
  const cont = db.prepare(`SELECT status, COUNT(*) n FROM mkt_content WHERE campaign_id=? AND archived=0 GROUP BY status`).all(o.id);
  return { com, pub, cont };
}

router.post('/ai/campaign-summary/:id', requireAuth, isStaff, (req, res) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.json({ ok: false, message: 'La IA todavia no esta configurada. Carga la variable OPENAI_API_KEY en Railway (servicio sistema-digiano) y volve a intentar.' });
  const o = db.prepare('SELECT * FROM objectives WHERE id=?').get(req.params.id);
  if (!o) return res.status(404).json({ error: 'No existe.' });
  const { com, pub, cont } = campaignContext(o);
  const contStr = cont.map((c) => `${c.status}: ${c.n}`).join(', ') || 'sin contenido';
  const prompt =
    `Datos de la campaña (correduria de seguros, no inventes datos fuera de estos):\n` +
    `- Nombre: ${o.name}\n- Tipo: ${o.type || 'comercial'}\n- Ramo: ${o.branch || 'varios'}\n` +
    `- Periodo: ${o.start_date} a ${o.end_date}\n- Meta de altas: ${o.target || 0}\n` +
    `- Comercial: ${com.ventas || 0} ventas, ${com.cotizaciones || 0} cotizaciones, ${com.contactados || 0} contactados, sobre ${com.total || 0} tareas.\n` +
    `- Marketing: ${pub.n || 0} publicaciones, ${pub.views || 0} visualizaciones, ${pub.reach || 0} de alcance, ${pub.likes || 0} likes, ${pub.comments || 0} comentarios.\n` +
    `- Contenido por estado: ${contStr}.\n\n` +
    `Escribi un analisis breve (maximo 180 palabras) con: 1) un resumen del estado, 2) 2-3 riesgos o puntos de atencion, 3) 2-3 recomendaciones accionables. Usa vinetas cortas.`;

  (async () => {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: 'Sos un analista de marketing y ventas para una correduria de seguros argentina. Respondes en español rioplatense, claro, concreto y accionable. No inventes cifras que no esten en los datos.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 600,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        return res.json({ ok: false, message: `La API de IA devolvio un error (${resp.status}). ${t.slice(0, 240)}` });
      }
      const data = await resp.json();
      const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
      if (!text) return res.json({ ok: false, message: 'La IA no devolvio texto.' });
      audit(req.user.id, 'ia_analisis_campana', 'objective', o.id, null);
      res.json({ ok: true, analysis: text });
    } catch (e) {
      res.json({ ok: false, message: 'No se pudo contactar la IA: ' + (e.message || String(e)) });
    }
  })();
});

export default router;
