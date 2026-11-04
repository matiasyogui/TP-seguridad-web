// API de A11yRank Mini. VULNERABLE A PROPOSITO (TP Seguridad). Solo laboratorio.
require('dotenv').config();
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const swaggerUi = require('swagger-ui-express');
const { prepararBase, Usuario, Dominio, Auditoria, Hallazgo } = require('./db');
const { analizarHtml, descargarHtml } = require('./analyzer');
const openapiSpec = require('./openapi');

const JWT_SECRET = process.env.JWT_SECRET || 'clave123';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1d';
const PORT = Number(process.env.PORT || 3000);
// shortcut: pausa artificial por paso; el análisis real tarda milisegundos y el progreso no se
// llegaría a ver en la demo. Con ANALISIS_PASO_MS=0 corre a velocidad real.
const ANALISIS_PASO_MS = Number(process.env.ANALISIS_PASO_MS ?? 1200);

const app = express();
app.use(cors());
app.use(express.json());

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});
const fail = (status, message) => Object.assign(new Error(message), { status });

function firmarToken(usuario) {
  // El claim `sub` es el id secuencial; la autorización confía sólo en esto.
  return jwt.sign({ sub: usuario.id_usuario }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Autorización stateless: no hay sesión del lado del servidor, así que un token
// con firma válida ES la identidad. Un token forjado con el secreto pasa igual.
function requireAuth(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(fail(401, 'Falta el token'));
  try {
    req.userId = jwt.verify(token, JWT_SECRET).sub;
    next();
  } catch {
    next(fail(401, 'Token inválido'));
  }
}

// A02 Security Misconfiguration (a proposito): doc OpenAPI expuesta SIN auth.
// Punto de partida del Paso 1: revela toda la superficie de la API (incluido el
// 409 vs 201 del register y el id_usuario secuencial) para el reconocimiento.
app.use('/api/v1/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
app.get('/api/v1/openapi.json', (_req, res) => res.json(openapiSpec));

app.get('/api/v1/health', (_req, res) => res.json({ status: 'ok' }));

// --- Auth ----------------------------------------------------------------
app.post('/api/v1/auth/register', wrap(async (req, res) => {
  const { nombre, apellido, email, password } = req.body || {};
  if (!nombre || !apellido || !email || !password) throw fail(400, 'Faltan campos obligatorios');
  // A07 (política débil): acepta cosas como "password1" => habilita fuerza bruta.
  if (!/^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(password)) throw fail(400, 'La contraseña debe tener al menos 8 caracteres, una letra y un número');
  // A07: respuesta distinta si el email existe (409) o no (201) => enumeración.
  if (await Usuario.findOne({ where: { email } })) throw fail(409, 'Ya existe una cuenta con ese email');
  const password_hash = await bcrypt.hash(password, 10);
  const usuario = await Usuario.create({ nombre, apellido, email, password_hash });
  res.status(201).json({ token: firmarToken(usuario), usuario: publico(usuario) });
}));

app.post('/api/v1/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const usuario = await Usuario.findOne({ where: { email } });
  if (!usuario || !(await bcrypt.compare(password, usuario.password_hash))) {
    throw fail(401, 'Credenciales inválidas');
  }
  res.json({ token: firmarToken(usuario), usuario: publico(usuario) });
}));

const publico = (u) => ({ id_usuario: u.id_usuario, nombre: u.nombre, apellido: u.apellido, email: u.email });

// --- Auditorías ----------------------------------------------------------
app.post('/api/v1/audits', requireAuth, wrap(async (req, res) => {
  const { url, dominio_id } = req.body || {};
  let parsed;
  try { parsed = new URL(url); } catch { throw fail(400, 'URL inválida'); }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw fail(400, 'La URL debe ser http/https');

  // Si no se indica dominio, se usa (o crea) el del host de la URL para este
  // usuario, así TODA auditoría puede publicarse en el leaderboard. Si se pasa
  // dominio_id, se respeta tal cual (A06: puede ser el dominio de otro usuario).
  let dominioId = dominio_id ?? null;
  if (dominioId == null) {
    const [dom] = await Dominio.findOrCreate({ where: { host: parsed.host, usuario_id: req.userId }, defaults: { publico: false } });
    dominioId = dom.id_dominio;
  }

  // Responde enseguida; el resultado se consulta con GET /audits/:id (estado y etapa).
  const auditoria = await Auditoria.create({ url, usuario_id: req.userId, dominio_id: dominioId, estado: 'EN_PROCESO', etapa: 'descargando' });
  correrAnalisis(auditoria);
  res.status(201).json(await conHallazgos(auditoria.id_auditoria));
}));

const pausa = () => new Promise((resolve) => setTimeout(resolve, ANALISIS_PASO_MS));

// Corre sin await desde el POST: nunca rechaza, todo error termina en FALLIDO.
async function correrAnalisis(auditoria) {
  try {
    const [html] = await Promise.all([descargarHtml(auditoria.url), pausa()]);
    await auditoria.update({ etapa: 'reglas' });
    await pausa();
    const { score, hallazgos } = analizarHtml(html);
    await auditoria.update({ etapa: 'puntaje' });
    await pausa();
    await Hallazgo.bulkCreate(hallazgos.map((h) => ({ ...h, auditoria_id: auditoria.id_auditoria })));
    await auditoria.update({ estado: 'COMPLETADO', etapa: null, score });
  } catch (err) {
    console.error(`Auditoría ${auditoria.id_auditoria} fallida:`, err.message);
    await auditoria.update({ estado: 'FALLIDO', etapa: null }).catch(console.error);
  }
}

app.get('/api/v1/audits', requireAuth, wrap(async (req, res) => {
  // Lista "mis" auditorías = las del sub del token. Con un token forjado de la
  // víctima, "mis" son las de la víctima (A01).
  res.json(await Auditoria.findAll({ where: { usuario_id: req.userId }, include: [Dominio], order: [['id_auditoria', 'DESC']] }));
}));

app.get('/api/v1/audits/:id', requireAuth, wrap(async (req, res) => {
  const auditoria = await Auditoria.findByPk(req.params.id);
  if (!auditoria || auditoria.usuario_id !== req.userId) throw fail(404, 'No encontrada');
  res.json(await conHallazgos(auditoria.id_auditoria));
}));

app.get('/api/v1/audits/:id/export', requireAuth, wrap(async (req, res) => {
  const auditoria = await Auditoria.findByPk(req.params.id);
  if (!auditoria || auditoria.usuario_id !== req.userId) throw fail(404, 'No encontrada');
  const hallazgos = await Hallazgo.findAll({ where: { auditoria_id: auditoria.id_auditoria } });
  const filas = [['regla', 'criterio', 'mensaje']].concat(hallazgos.map((h) => [h.regla, h.criterio, h.mensaje]));
  const csv = filas.map((f) => f.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  res.type('text/csv').attachment(`auditoria-${auditoria.id_auditoria}.csv`).send(csv);
}));

// --- Dominios ------------------------------------------------------------
app.post('/api/v1/domains', requireAuth, wrap(async (req, res) => {
  const { host } = req.body || {};
  if (!host) throw fail(400, 'Falta host');
  res.status(201).json(await Dominio.create({ host, usuario_id: req.userId, publico: false }));
}));

app.get('/api/v1/domains', requireAuth, wrap(async (req, res) => {
  res.json(await Dominio.findAll({ where: { usuario_id: req.userId } }));
}));

app.patch('/api/v1/domains/:id/visibility', requireAuth, wrap(async (req, res) => {
  const dominio = await Dominio.findByPk(req.params.id);
  if (!dominio || dominio.usuario_id !== req.userId) throw fail(404, 'No encontrado');
  // A01 (final de la Cadena 3): con el token forjado se opera COMO la víctima y
  // se publica SU dominio privado; el leaderboard expone su auditoría privada.
  dominio.publico = req.body?.publico !== false;
  await dominio.save();
  res.json(dominio);
}));

// --- Leaderboard (público, sin auth) -------------------------------------
app.get('/api/v1/leaderboard', wrap(async (_req, res) => {
  const dominios = await Dominio.findAll({
    where: { publico: true },
    include: [{ model: Auditoria, include: [Hallazgo] }],
    order: [['id_dominio', 'ASC']],
  });
  res.json(dominios);
}));

async function conHallazgos(id) {
  return Auditoria.findByPk(id, { include: [Hallazgo, Dominio] });
}

app.use(express.static(path.resolve(__dirname, '../public')));

// Errores de middleware (token inválido, JSON malformado) también como JSON.
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'Error interno' });
});

async function main() {
  await prepararBase();
  app.listen(PORT, () => console.log(`A11yRank Mini (LAB, vulnerable) en http://localhost:${PORT}`));
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { app };
