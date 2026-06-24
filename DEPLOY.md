# Poner el sistema en línea (con tu subdominio)

SiteGround **no soporta Node.js** en planes Shared/Cloud, así que la app se aloja en una plataforma de Node (acá usamos **Railway**) y apuntás un subdominio de tu dominio hacia ahí. Tu web principal y tu DNS siguen en SiteGround.

Resultado final: el sistema accesible en `https://sistema.tudominio.com` (el nombre del subdominio lo elegís vos), con HTTPS y la base de datos guardada de forma persistente.

---

## Parte 1 — Subir la app a Railway

Necesitás tener Node.js instalado (el mismo que usás para correrlo localmente).

1. **Crear cuenta** en https://railway.com (podés entrar con tu cuenta de Google/GitHub).

2. **Instalar la herramienta de Railway.** Abrí el "Símbolo del sistema" (cmd) y escribí:
   ```
   npm install -g @railway/cli
   ```

3. **Iniciar sesión** (se abre el navegador para confirmar):
   ```
   railway login
   ```

4. **Posicionarte en la carpeta del sistema:**
   ```
   cd "C:\Users\frand\Claude\Projects\Digiano Asesores\sistema-digiano"
   ```

5. **Crear el proyecto y desplegar:**
   ```
   railway init
   ```
   (poné un nombre, ej. `sistema-digiano`), y luego:
   ```
   railway up
   ```
   Esto sube el código y lo pone a correr. Esperá a que termine el deploy.

---

## Parte 2 — Disco persistente (para que la base no se borre)

1. Entrá a tu proyecto en https://railway.com → abrí el servicio que se creó.
2. Pestaña **Variables** → agregá:
   - `DATA_DIR` = `/data`
   - `NODE_ENV` = `production`
3. Pestaña **Settings** → sección **Volumes** → **Add Volume** → punto de montaje (Mount path): `/data`.
4. Railway reinicia el servicio. En el primer arranque crea la base y **carga automáticamente tus 270 clientes** en ese disco.

> Importante: sin el volumen, los datos se reinician en cada despliegue. Con el volumen montado en `/data` y `DATA_DIR=/data`, quedan guardados.

---

## Parte 3 — Conectar tu subdominio (DNS en SiteGround)

1. En Railway: servicio → **Settings** → **Networking** → **Custom Domain** → escribí `sistema.tudominio.com`.
   Railway te va a mostrar un destino tipo `xxxxx.up.railway.app` (un valor **CNAME**). Copialo.

2. En **SiteGround** → Site Tools → **Domain → DNS Zone Editor**:
   - Agregá un registro **CNAME**
   - Nombre/Host: `sistema`
   - Apunta a (Value): el valor `xxxxx.up.railway.app` que te dio Railway
   - Guardar.

3. Esperá unos minutos (a veces hasta 1-2 horas) a que propague. Railway genera el certificado HTTPS solo.

Listo: entrás desde `https://sistema.tudominio.com`.

---

## Parte 4 — Seguridad (hacelo sí o sí antes de usarlo en serio)

Vas a tener datos reales de clientes en internet, así que:

- **Configurá la variable `SEED_PASSWORD`** antes del primer arranque: define la contraseña inicial de los usuarios sembrados. No hay contraseña por defecto. Todos los usuarios deben cambiarla en el primer ingreso (cambio obligatorio forzado por el backend).
- Usá contraseñas largas y únicas.
- **Backups:** descargá periódicamente el archivo de la base. Es `/data/digiano.db` en el volumen (Railway permite abrir una shell del servicio para copiarlo, o se puede automatizar más adelante).
- Si querés que solo entre tu equipo, más adelante se puede sumar restricción por IP o un segundo factor (2FA) para el administrador.

---

## Alternativa: Render

Si preferís Render (https://render.com): New → **Web Service** → conectás un repo de GitHub con esta carpeta → Build command vacío, Start command `node server/index.js` → agregás un **Disk** montado en `/data` y la variable `DATA_DIR=/data`. El subdominio se conecta igual con un CNAME en SiteGround apuntando al dominio que te da Render.

> Nota: en Render, el plan gratuito no incluye disco persistente; para que la base no se pierda necesitás un plan con disco (similar a Railway).
