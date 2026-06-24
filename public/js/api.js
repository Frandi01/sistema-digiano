// Cliente HTTP minimo para la API.
async function req(method, path, body) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const res = await fetch('/api' + path, opt);
  let data = {};
  try { data = await res.json(); } catch (e) { /* respuesta sin cuerpo JSON (p. ej. 204): se ignora a proposito */ }
  if (!res.ok) {
    const err = new Error(data.error || 'Error de servidor');
    err.status = res.status; err.data = data;
    // Si el backend exige cambio de contraseña, avisar global para redirigir.
    if (res.status === 403 && /cambiar la contrase/i.test(err.message)) {
      try { window.dispatchEvent(new CustomEvent('must-change-password')); } catch (e) { /* noop */ }
    }
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => req('GET', p),
  post: (p, b) => req('POST', p, b ?? {}),
  put: (p, b) => req('PUT', p, b ?? {}),
  del: (p) => req('DELETE', p),
};
