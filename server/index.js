// Servidor: Express (micro) sirve la API (/api) y el frontend estatico (public/).
import express, { cookieParser } from './micro.js';
import path from 'path';
import { fileURLToPath } from 'url';
import api from './api.js';
import api2 from './api2.js';
import api3 from './api3.js';
import { ensureSeed } from './seed.js';
import { checkTaskInactivity } from './business.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

ensureSeed();
checkTaskInactivity();
setInterval(checkTaskInactivity, 6 * 3600 * 1000);

const app = express();
app.use(express.json());
app.use(cookieParser());

// API
app.use('/api', api);
app.use('/api', api2);
app.use('/api', api3);

// Frontend estatico
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  Sistema Digiano corriendo en  http://localhost:${PORT}\n`);
});
