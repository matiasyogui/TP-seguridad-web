// Front mínimo multipágina (vanilla, sin build), calcado del A11yRank real pero
// adaptado a los endpoints del mini. Mismas claves de localStorage que el real
// (a11yrank_token / a11yrank_user) — parte de la cadena del TP.
const API = '/api/v1';
const TOKEN_KEY = 'a11yrank_token';
const USER_KEY = 'a11yrank_user';

const getToken = () => localStorage.getItem(TOKEN_KEY) || '';
const getUsuario = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } };
const saveSession = (t, u) => { localStorage.setItem(TOKEN_KEY, t); localStorage.setItem(USER_KEY, JSON.stringify(u)); };
const clearSession = () => { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); };

async function api(method, path, body) {
  const resp = await fetch(API + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(getToken() ? { Authorization: 'Bearer ' + getToken() } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ct = resp.headers.get('content-type') || '';
  const data = ct.includes('json') ? await resp.json().catch(() => ({})) : await resp.text();
  if (!resp.ok) throw Object.assign(new Error((data && data.error) || data || 'Error inesperado'), { status: resp.status });
  return data;
}

// GET autenticado que descarga un archivo (un <a href> no manda Authorization).
async function descargar(path, nombre) {
  const resp = await fetch(API + path, { headers: getToken() ? { Authorization: 'Bearer ' + getToken() } : {} });
  if (!resp.ok) throw new Error('No se pudo descargar');
  const url = URL.createObjectURL(await resp.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: nombre });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const show = (el, msg, tipo = 'danger') => { el.innerHTML = `<div class="alert alert-${tipo} mb-4"><span class="alert-icon" aria-hidden="true">⚠</span><span>${esc(msg)}</span></div>`; };

// Solo toca el DOM si cambió: el polling no reinicia animaciones ni pierde el foco.
const pintar = (el, html) => {
  if (el._html === html) return;
  const foco = document.activeElement?.id;
  el._html = html; el.innerHTML = html;
  if (foco) document.getElementById(foco)?.focus();
};

// Puntaje 0-100 → nivel y colores (mismos cortes que el real; presentación, no viene del back).
const NIVELES = [
  { min: 90, t: 'Excelente',  color: '#10B981', bg: '#D1FAE5', text: '#047857' },
  { min: 80, t: 'Bueno',      color: '#3B82F6', bg: '#DBEAFE', text: '#1D4ED8' },
  { min: 70, t: 'Aceptable',  color: '#F59E0B', bg: '#FEF3C7', text: '#B45309' },
  { min: 50, t: 'Deficiente', color: '#F97316', bg: '#FFEDD5', text: '#C2410C' },
  { min: 0,  t: 'Crítico',    color: '#EF4444', bg: '#FEE2E2', text: '#B91C1C' },
];
const nivel = (score) => (score == null ? { t: '—', color: '#6B7280', bg: '#F3F4F6', text: '#374151' } : NIVELES.find((n) => score >= n.min));

const rtf = new Intl.RelativeTimeFormat('es-AR', { numeric: 'auto' });
function fechaRelativa(fecha) {
  const d = new Date(fecha);
  const seg = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(seg);
  if (abs < 45) return 'recién';
  if (abs < 3600) return rtf.format(Math.round(seg / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(seg / 3600), 'hour');
  if (abs < 604800) return rtf.format(Math.round(seg / 86400), 'day');
  if (abs < 2592000) return rtf.format(Math.round(seg / 604800), 'week');
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' });
}
const fechaHora = (fecha) => new Date(fecha).toLocaleString('es-AR', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const hostDe = (url) => new URL(url).host;
const enCurso = (a) => a.estado === 'EN_PROCESO';

const ESTADOS = {
  COMPLETADO: { label: 'Completada', cls: 'status-completado' },
  EN_PROCESO: { label: 'En proceso', cls: 'status-en-proceso' },
  FALLIDO:    { label: 'Fallida',    cls: 'status-fallido' },
};
const statusBadge = (estado) => { const c = ESTADOS[estado] || { label: estado, cls: 'status-cancelado' }; return `<span class="status-badge ${c.cls}" aria-label="Estado: ${esc(c.label)}"><span class="status-badge-dot" aria-hidden="true"></span>${esc(c.label)}</span>`; };

// Pasos del análisis, en orden: `id` es Auditoria.etapa.
const PASOS = [
  { id: 'descargando', texto: 'Descargando el HTML de la página' },
  { id: 'reglas',      texto: 'Revisando las reglas WCAG sobre el markup' },
  { id: 'puntaje',     texto: 'Agrupando hallazgos y calculando el puntaje' },
];
const textoPaso = (etapa) => (PASOS.find((p) => p.id === etapa) || PASOS[0]).texto;

const statCard = ({ icon, value, label, accent = 'navy', sub }) => `<div class="stat-card stat-card-${accent}" role="figure" aria-label="${esc(label)}: ${esc(value)}">
  <div class="flex items-center justify-between"><div class="stat-card-icon stat-card-icon-${accent}" aria-hidden="true">${icon}</div></div>
  <div class="stat-card-value" aria-hidden="true">${esc(value)}</div>
  <div class="stat-card-label">${esc(label)}</div>
  ${sub ? `<div class="stat-card-sub">${esc(sub)}</div>` : ''}
</div>`;
const vacio = (icon, titulo, desc, accion = '') => `<div class="empty-state"><div class="empty-state-icon" aria-hidden="true">${icon}</div><div class="empty-state-title">${esc(titulo)}</div><div class="empty-state-desc">${esc(desc)}</div>${accion}</div>`;

// Catálogo de reglas del analizador → título legible + severidad (el mini no
// guarda severidad; se asigna acá, como el SeverityBadge del real).
const CATALOGO = {
  'img-alt':            { titulo: 'Imágenes sin texto alternativo', sev: 'CRITICA' },
  'html-lang':          { titulo: 'Idioma de la página no declarado', sev: 'MODERADA' },
  'doc-title':          { titulo: 'Falta el título de la página', sev: 'MODERADA' },
  'control-sin-nombre': { titulo: 'Controles de formulario sin etiqueta', sev: 'CRITICA' },
  'enlace-sin-texto':   { titulo: 'Enlaces sin texto perceptible', sev: 'MODERADA' },
  'boton-sin-texto':    { titulo: 'Botones sin texto perceptible', sev: 'CRITICA' },
  'headings-orden':     { titulo: 'Saltos en la jerarquía de encabezados', sev: 'MENOR' },
};
const SEVERIDAD = {
  BLOQUEANTE: { label: 'Bloqueante', cls: 'severity-bloqueante', icon: '⛔' },
  CRITICA:    { label: 'Crítica',    cls: 'severity-critica',    icon: '🔴' },
  MODERADA:   { label: 'Moderada',   cls: 'severity-moderada',   icon: '🟡' },
  MENOR:      { label: 'Menor',      cls: 'severity-menor',      icon: '🔵' },
};
const ORDEN_SEV = { BLOQUEANTE: 3, CRITICA: 2, MODERADA: 1, MENOR: 0 };
const severityBadge = (sev) => { const c = SEVERIDAD[sev] || SEVERIDAD.MENOR; return `<span class="severity-badge ${c.cls}"><span aria-hidden="true">${c.icon}</span>${c.label}</span>`; };

// "Descripción: <tag>" → el <tag> va en un bloque de código; el resto, texto.
function partirMensaje(msg) {
  const m = String(msg).match(/^(.*?):\s*(<[a-z][^>]*>)\s*$/i);
  return m ? { texto: m[1], codigo: m[2] } : { texto: msg, codigo: null };
}
function renderHallazgo(h) {
  const { texto, codigo } = partirMensaje(h.mensaje);
  return `<div class="finding-item"><div>${esc(texto)}</div>${
    codigo ? `<div class="code-block-wrapper code-block-original"><div class="code-block-header"><span>Elemento</span></div><pre class="code-block-pre"><code>${esc(codigo)}</code></pre></div>` : ''
  }</div>`;
}

// --- Header compartido (session-aware, como el del real) --------------------
function mountHeader(page) {
  const slot = document.getElementById('app-header');
  if (!slot) return;
  const u = getUsuario();
  const links = (cls) => `${u ? `<a href="index.html" class="${cls}${page === 'dashboard' ? ' active' : ''}">Dashboard</a>` : ''}<a href="leaderboard.html" class="${cls}${page === 'leaderboard' ? ' active' : ''}">Leaderboard</a>`;
  const iniciales = u ? ((u.nombre || '')[0] || '') + ((u.apellido || '')[0] || '') : '';
  const claro = 'color:rgba(255,255,255,.85);border-color:rgba(255,255,255,.2)';
  slot.outerHTML = `
    <a href="#main-content" class="skip-link">Saltar al contenido principal</a>
    <header class="app-header" role="banner">
      <a href="${u ? 'index.html' : 'leaderboard.html'}" class="app-header-logo" aria-label="A11yRank — inicio">
        <span class="app-header-wordmark"><span class="wordmark-a11y">A11y</span><span class="wordmark-rank">Rank</span></span>
      </a>
      <nav class="app-header-nav" aria-label="Navegación principal">${links('nav-link')}</nav>
      <div class="app-header-actions">
        ${u
          ? `<div style="position:relative" id="user-menu">
               <button type="button" class="user-menu-btn" id="user-menu-btn" aria-haspopup="menu" aria-expanded="false" aria-label="Menú de usuario: ${esc(u.nombre)} ${esc(u.apellido || '')}">
                 <span class="user-avatar" aria-hidden="true">${esc(iniciales.toUpperCase() || '?')}</span>
                 <span class="hide-mobile" style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(u.nombre)}</span>
                 <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
               </button>
               <div class="user-menu-dropdown" id="user-menu-list" role="menu" aria-label="Opciones de usuario" hidden>
                 <div class="user-menu-info">
                   <div style="font-weight:700;font-size:.875rem;color:var(--color-text-main)">${esc(u.nombre)} ${esc(u.apellido || '')}</div>
                   <div style="font-size:.8rem;color:var(--color-text-muted);margin-top:.125rem">${esc(u.email)}</div>
                 </div>
                 <a href="index.html" class="user-menu-item" role="menuitem"><span aria-hidden="true">📊</span>Dashboard</a>
                 <div class="user-menu-divider"></div>
                 <button type="button" class="user-menu-item user-menu-item-danger" role="menuitem" data-logout><span aria-hidden="true">↩</span>Cerrar sesión</button>
               </div>
             </div>`
          : `<a href="login.html" class="btn btn-outline btn-sm" style="${claro}">Iniciar sesión</a>
             <a href="register.html" class="btn btn-sm" style="background:#FF6500;color:#fff;border-color:#FF6500">Registrarse</a>`}
        <button type="button" class="hamburger-btn" id="hamburger" aria-label="Abrir menú" aria-expanded="false" aria-controls="mobile-nav"><span></span><span></span><span></span></button>
      </div>
    </header>
    <nav id="mobile-nav" class="mobile-nav-overlay" aria-label="Menú móvil" hidden>
      ${links('mobile-nav-link')}
      <div class="user-menu-divider" style="background:rgba(255,255,255,.12);margin:.5rem 0"></div>
      ${u
        ? `<button type="button" class="mobile-nav-link" style="border:none;cursor:pointer;background:none;font-family:inherit;font-weight:600" data-logout>↩ Cerrar sesión</button>`
        : `<a href="login.html" class="mobile-nav-link">Iniciar sesión</a><a href="register.html" class="mobile-nav-link">Registrarse</a>`}
    </nav>`;

  document.querySelectorAll('[data-logout]').forEach((b) => { b.onclick = () => { clearSession(); location.href = 'login.html'; }; });

  const movil = document.getElementById('mobile-nav');
  const hamburguesa = document.getElementById('hamburger');
  hamburguesa.onclick = () => {
    movil.hidden = !movil.hidden;
    movil.style.display = movil.hidden ? '' : 'flex'; // .mobile-nav-overlay arranca en display:none
    hamburguesa.setAttribute('aria-expanded', String(!movil.hidden));
    hamburguesa.setAttribute('aria-label', movil.hidden ? 'Abrir menú' : 'Cerrar menú');
  };

  const menu = document.getElementById('user-menu');
  if (!menu) return;
  const boton = document.getElementById('user-menu-btn');
  const lista = document.getElementById('user-menu-list');
  const abrir = (si) => { lista.hidden = !si; boton.setAttribute('aria-expanded', String(si)); };
  boton.onclick = () => abrir(lista.hidden);
  document.addEventListener('mousedown', (e) => { if (!menu.contains(e.target)) abrir(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !lista.hidden) { abrir(false); boton.focus(); } });
}

function requireSession() { if (!getToken()) location.href = 'login.html'; }

// --- Login ------------------------------------------------------------------
function initLogin() {
  const f = document.getElementById('form');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById('err'); err.innerHTML = '';
    try {
      const data = await api('POST', '/auth/login', { email: f.email.value, password: f.password.value });
      saveSession(data.token, data.usuario);
      location.href = 'index.html';
    } catch (ex) { show(err, ex.message); }
  };
}

// --- Registro ---------------------------------------------------------------
const REQS = [
  { t: '8 caracteres o más', ok: (p) => p.length >= 8 },
  { t: 'una letra', ok: (p) => /[A-Za-z]/.test(p) },
  { t: 'un número', ok: (p) => /\d/.test(p) },
];
function initRegister() {
  const f = document.getElementById('form');
  const ul = document.getElementById('reqs');
  const pintar = () => { ul.innerHTML = REQS.map((r) => { const ok = r.ok(f.password.value); return `<li class="${ok ? 'ok' : ''}"><span aria-hidden="true">${ok ? '✓' : '○'}</span> ${r.t}</li>`; }).join(''); };
  f.password.oninput = pintar; pintar();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById('err'); err.innerHTML = '';
    try {
      const data = await api('POST', '/auth/register', { nombre: f.nombre.value, apellido: f.apellido.value, email: f.email.value, password: f.password.value });
      saveSession(data.token, data.usuario);
      location.href = 'index.html';
    } catch (ex) { show(err, ex.message); }
  };
}

// --- Dashboard --------------------------------------------------------------
const AUDITORIAS_POR_PAGINA = 10;
const FILTROS_ESTADO = ['TODAS', 'COMPLETADO', 'EN_PROCESO', 'FALLIDO'];
let auditorias = [];
let cargadas = false;
let filtro = { texto: '', estado: 'TODAS', pagina: 1 };
let timerDashboard;

// "ejemplo.com" → "https://ejemplo.com"; lo que ya trae protocolo queda igual.
function completarProtocolo(valor) {
  const limpio = valor.trim();
  return !limpio || /^[a-z][a-z0-9+.-]*:\/\//i.test(limpio) ? limpio : `https://${limpio}`;
}

function initDashboard() {
  const u = getUsuario();
  if (u) document.getElementById('saludo').textContent = `Hola, ${u.nombre} 👋`;

  const modal = document.getElementById('nueva-modal');
  const form = document.getElementById('audit-form');
  const enviar = document.getElementById('audit-enviar');
  document.getElementById('nueva-btn').onclick = () => modal.showModal();
  modal.querySelectorAll('[data-cerrar]').forEach((b) => { b.onclick = () => modal.close(); });
  modal.onclick = (e) => { if (e.target === modal) modal.close(); };
  form.url.onblur = () => { form.url.value = completarProtocolo(form.url.value); };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById('audit-form-err'); err.innerHTML = '';
    enviar.disabled = true;
    try {
      const nueva = await api('POST', '/audits', { url: completarProtocolo(form.url.value) });
      location.href = 'audit.html?id=' + nueva.id_auditoria;
    } catch (ex) { show(err, ex.message); enviar.disabled = false; }
  };

  document.getElementById('busqueda').oninput = (e) => { filtro = { ...filtro, texto: e.target.value, pagina: 1 }; renderDashboard(); };
  document.querySelectorAll('[data-filtro]').forEach((b) => { b.onclick = () => { filtro = { ...filtro, estado: b.dataset.filtro, pagina: 1 }; renderDashboard(); }; });

  const cont = document.getElementById('audits');
  cont.onclick = async (e) => {
    const pag = e.target.closest('[data-pag]');
    if (pag) {
      filtro = { ...filtro, pagina: filtro.pagina + Number(pag.dataset.pag) };
      renderDashboard();
      (cont.querySelector(`[data-pag="${pag.dataset.pag}"]:not(:disabled)`) || cont.querySelector('[data-pag]:not(:disabled)'))?.focus();
    }
    if (e.target.closest('[data-limpiar]')) {
      filtro = { texto: '', estado: 'TODAS', pagina: 1 };
      document.getElementById('busqueda').value = '';
      renderDashboard();
    }
    if (e.target.closest('[data-nueva]')) modal.showModal();
    const re = e.target.closest('[data-reauditar]');
    if (re) {
      const a = auditorias.find((x) => x.id_auditoria === Number(re.dataset.reauditar));
      re.disabled = true;
      try { await api('POST', '/audits', { url: a.url, dominio_id: a.dominio_id }); }
      catch (ex) { show(document.getElementById('audit-err'), ex.message); }
      cargarAuditorias();
    }
  };

  cargarAuditorias();
}

async function cargarAuditorias() {
  const err = document.getElementById('audit-err');
  try {
    auditorias = await api('GET', '/audits');
    cargadas = true;
    err.innerHTML = '';
    renderDashboard();
  } catch (ex) { show(err, ex.message); }
  // Rápido mientras algo corre; si no, igual se refresca (como el real) por si se lanzó desde otro lado.
  clearTimeout(timerDashboard);
  timerDashboard = setTimeout(cargarAuditorias, auditorias.some(enCurso) ? 1000 : 5000);
}

const coincideEstado = (a, estado) => estado === 'TODAS' || a.estado === estado;

function renderDashboard() {
  const total = auditorias.length;
  const corriendo = auditorias.filter(enCurso);
  const completadas = auditorias.filter((a) => a.estado === 'COMPLETADO').length;
  const fallidas = auditorias.filter((a) => a.estado === 'FALLIDO').length;

  // De la más vieja a la más nueva: al final queda el último puntaje de cada dominio.
  const ultimoPorHost = new Map();
  const deltas = new Map();
  for (const a of [...auditorias].reverse()) {
    if (a.score == null) continue;
    const host = hostDe(a.url);
    if (ultimoPorHost.has(host)) deltas.set(a.id_auditoria, a.score - ultimoPorHost.get(host));
    ultimoPorHost.set(host, a.score);
  }
  const puntajes = [...ultimoPorHost.values()];
  const promedio = puntajes.length ? Math.round(puntajes.reduce((s, v) => s + v, 0) / puntajes.length) : '—';

  pintar(document.getElementById('stats'), [
    statCard({ icon: '📋', value: total, label: 'Total auditorías', accent: 'navy', sub: total ? `${completadas} completadas (${Math.round((completadas / total) * 100)}%)` : '' }),
    statCard({ icon: '📈', value: promedio, label: 'Score promedio', accent: 'teal', sub: puntajes.length ? `Último puntaje de ${puntajes.length} ${puntajes.length === 1 ? 'dominio' : 'dominios'}` : 'Todavía no hay puntajes' }),
    statCard({ icon: '⚙️', value: corriendo.length, label: 'En proceso', accent: 'warning' }),
    statCard({ icon: '⚠️', value: fallidas, label: 'Fallidas', accent: fallidas ? 'danger' : 'navy' }),
  ].join(''));

  const hosts = [...new Set(corriendo.map((a) => hostDe(a.url)))].join(', ');
  pintar(document.getElementById('en-curso'), corriendo.length ? `<div class="progress-banner">
    <span class="spinner" aria-hidden="true"></span>
    <div class="progress-banner-text">
      <p style="font-weight:600;font-size:.9375rem;color:var(--color-info-dark);margin-bottom:0">${corriendo.length === 1 ? 'Analizando' : `Analizando ${corriendo.length} auditorías:`} ${esc(hosts)}…</p>
      <p style="font-size:.8125rem;color:var(--color-info-dark);opacity:.8;margin-bottom:0">La lista se actualiza sola, no hace falta recargar.</p>
      <div class="progress-track"><div class="progress-fill"></div></div>
    </div>
    ${corriendo.length === 1 ? `<a href="audit.html?id=${corriendo[0].id_auditoria}" class="btn btn-outline btn-sm">Ver progreso</a>` : ''}
  </div>` : '');

  const texto = filtro.texto.trim().toLowerCase();
  const filtradas = auditorias.filter((a) => coincideEstado(a, filtro.estado) && (!texto || a.url.toLowerCase().includes(texto)));
  const hayFiltros = texto !== '' || filtro.estado !== 'TODAS';

  document.getElementById('filtros').hidden = !total;
  document.getElementById('conteo').textContent = total ? `${hayFiltros ? `${filtradas.length} de ${total}` : total} ${total === 1 ? 'auditoría' : 'auditorías'}` : '';
  for (const id of FILTROS_ESTADO) {
    const chip = document.querySelector(`[data-filtro="${id}"]`);
    const cuenta = auditorias.filter((a) => coincideEstado(a, id)).length;
    chip.setAttribute('aria-pressed', String(filtro.estado === id));
    chip.disabled = id !== 'TODAS' && cuenta === 0 && filtro.estado !== id;
    chip.querySelector('.chip-count').textContent = cuenta;
  }

  const cont = document.getElementById('audits');
  if (!cargadas) return;
  if (!total) return pintar(cont, vacio('🔍', 'Todavía no tenés auditorías', 'Iniciá tu primera auditoría para descubrir problemas de accesibilidad en tu sitio.', '<button type="button" class="btn btn-primary" data-nueva>+ Nueva auditoría</button>'));
  if (!filtradas.length) return pintar(cont, vacio('🔎', 'No hay auditorías que coincidan', 'Probá con otro dominio o sacá alguno de los filtros.', '<button type="button" class="btn btn-outline" data-limpiar>Limpiar filtros</button>'));

  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / AUDITORIAS_POR_PAGINA));
  const pagina = Math.min(filtro.pagina, totalPaginas);
  const desde = (pagina - 1) * AUDITORIAS_POR_PAGINA;
  const filas = filtradas.slice(desde, desde + AUDITORIAS_POR_PAGINA).map((a) => filaAuditoria(a, deltas.get(a.id_auditoria))).join('');

  pintar(cont, `<div class="table-container"><table class="table" aria-label="Lista de auditorías">
    <thead><tr><th scope="col">Sitio</th><th scope="col">Puntaje</th><th scope="col">Estado</th><th scope="col">Tipo</th><th scope="col">Fecha</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
    <tbody>${filas}</tbody>
  </table></div>
  ${filtradas.length > AUDITORIAS_POR_PAGINA ? `<div class="table-footer">
    <span>Mostrando ${desde + 1}–${Math.min(desde + AUDITORIAS_POR_PAGINA, filtradas.length)} de ${filtradas.length}</span>
    <nav class="pagination" aria-label="Paginación de auditorías">
      <button type="button" class="btn btn-outline btn-sm" data-pag="-1" ${pagina === 1 ? 'disabled' : ''} aria-label="Página anterior">← Anterior</button>
      <span style="padding:0 .5rem;font-weight:600" aria-current="page">${pagina} / ${totalPaginas}</span>
      <button type="button" class="btn btn-outline btn-sm" data-pag="1" ${pagina === totalPaginas ? 'disabled' : ''} aria-label="Página siguiente">Siguiente →</button>
    </nav>
  </div>` : ''}`);
}

function scorePill(score) {
  if (score == null) return '<span style="color:var(--color-text-light);font-size:.8125rem">—</span>';
  const n = nivel(score);
  return `<span class="score-pill" style="background:${n.bg};color:${n.text}" title="${n.t}" aria-label="Puntaje ${score} de 100, nivel ${n.t}"><span class="score-pill-dot" style="background:${n.color}" aria-hidden="true"></span>${score}</span>`;
}

function deltaPuntaje(delta) {
  if (!delta) return '';
  const sube = delta > 0;
  return `<span style="font-size:.75rem;font-weight:700;color:var(--color-${sube ? 'success' : 'danger'}-dark)" title="Variación contra la auditoría anterior de este dominio" aria-label="${sube ? 'Subió' : 'Bajó'} ${Math.abs(delta)} puntos contra la auditoría anterior"><span aria-hidden="true">${sube ? '▲' : '▼'} ${Math.abs(delta)}</span></span>`;
}

function filaAuditoria(a, delta) {
  const host = esc(hostDe(a.url));
  return `<tr>
    <td><a href="audit.html?id=${a.id_auditoria}" class="audit-row-domain" title="${esc(a.url)}">${host}</a></td>
    <td><span class="flex items-center gap-2" style="white-space:nowrap">${scorePill(a.score)}${deltaPuntaje(delta)}</span></td>
    <td>${statusBadge(a.estado)}${enCurso(a) ? `<div class="audit-row-meta">${esc(textoPaso(a.etapa))}…</div>` : ''}</td>
    <td><span class="badge badge-navy">Sintáctica</span></td>
    <td style="color:var(--color-text-muted);font-size:.8125rem;white-space:nowrap" title="${esc(fechaHora(a.createdAt))}">${esc(fechaRelativa(a.createdAt))}</td>
    <td><div class="flex gap-2" style="flex-wrap:wrap;justify-content:flex-end">
      <a href="audit.html?id=${a.id_auditoria}" class="btn btn-outline btn-sm">Ver detalle</a>
      ${enCurso(a) ? '' : `<button type="button" class="btn btn-ghost btn-sm" data-reauditar="${a.id_auditoria}" title="Volver a auditar" aria-label="Volver a auditar ${host}"><span aria-hidden="true">↻</span> Reauditar</button>`}
    </div></td>
  </tr>`;
}

// --- Detalle de auditoría ---------------------------------------------------
const TABS = [
  { id: 'resumen', label: 'Resumen', icon: '📊' },
  { id: 'hallazgos', label: 'Hallazgos', icon: '🔍' },
  { id: 'benchmark', label: 'Benchmark', icon: '🏆' },
];
let auditoria = null;
let puestoRanking = '';
let tabActiva = 'resumen';

function initAudit() {
  const id = new URLSearchParams(location.search).get('id');
  const cont = document.getElementById('detalle');

  const cambiarTab = (tab) => { tabActiva = tab; renderAudit(); document.getElementById('tab-' + tab).focus(); };
  cont.onkeydown = (e) => {
    if (!e.target.matches('[role="tab"]')) return;
    const i = TABS.findIndex((t) => t.id === tabActiva);
    const j = { ArrowRight: (i + 1) % TABS.length, ArrowLeft: (i - 1 + TABS.length) % TABS.length, Home: 0, End: TABS.length - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    cambiarTab(TABS[j].id);
  };
  cont.onclick = async (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) return cambiarTab(tab.dataset.tab);
    const accion = e.target.closest('[data-accion]')?.dataset.accion;
    if (!accion) return;
    const err = document.getElementById('accion-err'); err.innerHTML = '';
    try {
      if (accion === 'exportar') await descargar(`/audits/${id}/export?format=csv`, `auditoria-${id}.csv`);
      if (accion === 'reauditar') {
        const nueva = await api('POST', '/audits', { url: auditoria.url, dominio_id: auditoria.dominio_id });
        location.href = 'audit.html?id=' + nueva.id_auditoria;
      }
      if (accion === 'visibilidad') {
        const dom = auditoria.Dominio;
        await api('PATCH', `/domains/${dom.id_dominio}/visibility`, { publico: !dom.publico });
        await cargarAuditoria(id);
      }
    } catch (ex) { show(err, ex.message); }
  };
  cargarAuditoria(id);
}

async function cargarAuditoria(id) {
  try {
    auditoria = await api('GET', '/audits/' + id);
    const dom = auditoria.Dominio;
    puestoRanking = dom && dom.publico && !enCurso(auditoria) ? await calcularPuesto(dom.id_dominio) : '';
    renderAudit();
  } catch (ex) {
    // Un error suelto del polling no tira la pantalla: el próximo ciclo reintenta.
    if (!auditoria) return show(document.getElementById('detalle'), ex.message);
  }
  if (enCurso(auditoria)) setTimeout(() => cargarAuditoria(id), 1000);
}

// Puesto en el ranking, solo si el dominio es público (dato complementario).
async function calcularPuesto(idDominio) {
  try {
    const lb = await api('GET', '/leaderboard');
    const filas = lb.map((d) => ({ id: d.id_dominio, score: (d.Auditoria || []).filter((x) => x.score != null).reduce((m, x) => Math.max(m, x.score), -1) })).sort((x, y) => y.score - x.score);
    const idx = filas.findIndex((f) => f.id === idDominio);
    return idx < 0 ? '' : `${idx < 3 ? ['🥇', '🥈', '🥉'][idx] + ' ' : ''}Puesto #${idx + 1} de ${filas.length}`;
  } catch { return ''; }
}

const RADIO = 40;
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;
function scoreRing(score, size = 110) {
  const n = nivel(score);
  return `<div class="score-ring-wrapper">
    <div style="position:relative;width:${size}px;height:${size}px">
      <svg viewBox="0 0 100 100" width="${size}" height="${size}" class="score-ring-svg" aria-hidden="true">
        <circle class="score-ring-track" cx="50" cy="50" r="${RADIO}" stroke="var(--color-border)" stroke-width="10"></circle>
        <circle class="score-ring-progress" cx="50" cy="50" r="${RADIO}" stroke="${n.color}" stroke-width="10" stroke-dasharray="${CIRCUNFERENCIA}" stroke-dashoffset="${CIRCUNFERENCIA * (1 - score / 100)}"></circle>
      </svg>
      <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.1rem">
        <span class="score-value" style="font-size:${size * 0.22}px">${score}</span>
        <span class="score-label" style="font-size:${size * 0.1}px">/100</span>
      </div>
    </div>
    <span class="score-nivel" style="background:${n.bg};color:${n.text}" aria-hidden="true">${n.t}</span>
  </div>`;
}

// Sin navegador headless no hay transmisión en vivo: del progreso del real queda la columna de pasos.
function renderProgreso(a) {
  const actual = Math.max(0, PASOS.findIndex((p) => p.id === a.etapa));
  const porcentaje = Math.round(((actual + 0.5) / PASOS.length) * 100);
  return `<section class="progreso-vivo" style="grid-template-columns:minmax(0,1fr)" aria-label="Progreso de la auditoría">
    <div class="progreso-vivo-info">
      <p class="progreso-vivo-titulo">Analizando la página</p>
      <p class="progreso-vivo-url" title="${esc(a.url)}">${esc(a.url)}</p>
      <div class="progress-track" role="progressbar" aria-label="Avance de la auditoría" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${porcentaje}"><div class="progress-fill progress-fill-determinate" style="width:${porcentaje}%"></div></div>
      <ol class="progreso-vivo-pasos">${PASOS.map((p, i) => {
        const hecho = i < actual;
        const esActual = i === actual;
        return `<li class="${hecho ? 'hecho' : esActual ? 'actual' : ''}"${esActual ? ' aria-current="step"' : ''}><span class="progreso-vivo-marca" aria-hidden="true">${hecho ? '✓' : esActual ? '' : '○'}</span>${esActual ? '<span class="spinner spinner-sm" aria-hidden="true"></span>' : ''}${esc(p.texto)}</li>`;
      }).join('')}</ol>
    </div>
  </section>`;
}

function grupoHallazgos(g) {
  return `<details class="finding-group" open>
    <summary class="finding-group-header">
      <svg class="chevron-icon" width="12" height="12" viewBox="0 0 14 14" aria-hidden="true" style="flex-shrink:0"><path d="M5 2l5 5-5 5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      ${severityBadge(g.sev)}
      <span style="font-weight:700;font-size:.875rem;color:var(--color-text-main);flex:1;min-width:0">${esc(g.titulo)}</span>
      <span style="font-size:.8rem;color:var(--color-text-muted);white-space:nowrap">${g.items.length} ${g.items.length === 1 ? 'elemento' : 'elementos'}</span>
      <span class="badge badge-neutral">WCAG ${esc(g.items[0].criterio)}</span>
    </summary>
    <div class="finding-group-body">${g.items.map(renderHallazgo).join('')}</div>
  </details>`;
}

function renderAudit() {
  const a = auditoria;
  const host = hostDe(a.url);
  const completa = a.estado === 'COMPLETADO';
  const corriendo = enCurso(a);
  const hallazgos = a.Hallazgos || [];
  const dom = a.Dominio;
  document.title = `Auditoría de ${host} · A11yRank Mini`;

  // Agrupados por regla y ordenados por severidad (más grave primero), como el real.
  const porRegla = {};
  for (const h of hallazgos) (porRegla[h.regla] ??= []).push(h);
  const grupos = Object.entries(porRegla)
    .map(([regla, items]) => ({ items, titulo: (CATALOGO[regla] || {}).titulo || regla, sev: (CATALOGO[regla] || {}).sev || 'MENOR' }))
    .sort((x, y) => ORDEN_SEV[y.sev] - ORDEN_SEV[x.sev] || y.items.length - x.items.length);
  const contar = (sev) => grupos.filter((g) => g.sev === sev).reduce((s, g) => s + g.items.length, 0);
  const criticos = contar('CRITICA') + contar('BLOQUEANTE');
  const sinResultados = corriendo
    ? vacio('⏳', 'La auditoría está en curso', 'Los hallazgos aparecen acá cuando termine. No hace falta recargar.')
    : vacio('📄', 'Sin resultados', 'No se analizaron páginas en esta auditoría.');

  const paneles = {
    resumen: () => {
      if (!completa) return `<div class="card card-flat">${sinResultados}</div>`;
      if (!hallazgos.length) return `<div class="card card-flat">${vacio('🎉', 'Sin hallazgos detectados', 'No se encontraron problemas de accesibilidad en la página analizada. ¡Excelente trabajo!')}</div>`;
      return `<div class="flex flex-col gap-6">
        <div class="card card-flat">
          <h2 class="section-title">Distribución por severidad</h2>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:.75rem">
            ${Object.keys(SEVERIDAD).map((sev) => `<div role="figure" aria-label="${SEVERIDAD[sev].label}: ${contar(sev)}" style="display:flex;flex-direction:column;gap:.5rem;padding:1rem;background:var(--color-surface-raised);border:1px solid var(--color-border);border-radius:var(--radius-lg);align-items:center;text-align:center">
              <span style="font-size:1.5rem;font-weight:800;color:var(--color-text-main)" aria-hidden="true">${contar(sev)}</span>${severityBadge(sev)}
            </div>`).join('')}
          </div>
        </div>
        <div class="card card-flat">
          <h2 class="section-title">Qué corregir primero</h2>
          <div class="flex flex-col gap-3">
            ${grupos.slice(0, 6).map((g, i) => `<button type="button" class="top-issue" data-tab="hallazgos" aria-label="${esc(g.titulo)}: ver los ${g.items.length} elementos en la pestaña Hallazgos">
              <span aria-hidden="true" style="width:1.75rem;height:1.75rem;border-radius:50%;background:var(--color-navy-100);color:var(--color-navy);font-size:.8125rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${i + 1}</span>
              <span style="display:block;flex:1;min-width:0">
                <span style="display:block;font-weight:700;font-size:.875rem;color:var(--color-text-main);margin-bottom:.25rem">${esc(g.titulo)}</span>
                <span class="flex items-center gap-2 flex-wrap">${severityBadge(g.sev)}<span style="font-size:.8rem;color:var(--color-text-muted)">${g.items.length} ${g.items.length === 1 ? 'elemento' : 'elementos'}</span></span>
              </span>
              <span class="top-issue-arrow hide-mobile" aria-hidden="true">Ver dónde →</span>
            </button>`).join('')}
          </div>
        </div>
      </div>`;
    },
    hallazgos: () => {
      if (!completa) return `<div class="card card-flat">${sinResultados}</div>`;
      if (!hallazgos.length) return `<div class="card card-flat">${vacio('✅', 'Sin hallazgos', 'Esta página no disparó ninguna regla de accesibilidad.')}</div>`;
      return `<div class="flex flex-col gap-3">${grupos.map(grupoHallazgos).join('')}</div>`;
    },
    benchmark: () => (dom ? `<div class="card card-flat">
      <h2 class="section-title">Leaderboard público</h2>
      <p style="font-size:.9rem;margin-bottom:1rem">Por defecto, el puntaje de <strong>${esc(dom.host)}</strong> es privado. Hacerlo público lo suma al ranking visible para todos.</p>
      <div class="flex items-center gap-4 flex-wrap">
        <div class="flex flex-col gap-1">
          <div class="status-badge ${dom.publico ? 'status-completado' : 'status-cancelado'}"><span class="status-badge-dot" aria-hidden="true"></span>${dom.publico ? 'Público' : 'Privado'}</div>
          ${puestoRanking ? `<span class="text-sm" style="font-weight:700;color:var(--color-navy)">${esc(puestoRanking)}</span>` : ''}
        </div>
        <button type="button" class="btn ${dom.publico ? 'btn-outline' : 'btn-primary'}" data-accion="visibilidad">${dom.publico ? 'Hacer privado' : 'Hacer público'}</button>
      </div>
      <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--color-border)"><a href="leaderboard.html" style="font-weight:600;font-size:.875rem">Ver leaderboard completo →</a></div>
    </div>` : `<div class="card card-flat">${vacio('🏆', 'Benchmark no disponible', 'Esta auditoría no está asociada a un dominio.')}</div>`),
  };

  pintar(document.getElementById('detalle'), `
    <div class="page-header">
      <div class="page-header-left" style="min-width:0">
        <h1 class="page-title page-title-wrap" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%" title="${esc(a.url)}">Auditoría de ${esc(host)}</h1>
        <div class="flex items-center gap-2 mt-2 flex-wrap">
          ${statusBadge(a.estado)}
          <span class="badge badge-navy">Sintáctica</span>
          <span style="font-size:.8125rem;color:var(--color-text-muted)">Creada el ${esc(fechaHora(a.createdAt))}</span>
          <a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer" style="font-size:.8125rem;font-weight:600;color:var(--color-navy-500)">Visitar sitio ↗<span class="sr-only"> (se abre en una pestaña nueva)</span></a>
        </div>
      </div>
      <div class="page-header-right">
        ${corriendo ? '' : `<button type="button" class="btn btn-outline btn-sm" id="accion-reauditar" data-accion="reauditar" title="Volver a auditar" aria-label="Volver a auditar ${esc(host)}"><span aria-hidden="true">↻</span> Volver a auditar</button>`}
        <button type="button" class="btn btn-outline btn-sm" id="accion-exportar" data-accion="exportar" ${completa ? '' : 'disabled'} aria-label="Exportar auditoría en formato CSV">↓ CSV</button>
      </div>
    </div>
    <div id="accion-err"></div>

    ${a.estado === 'FALLIDO' ? `<div class="alert alert-danger mb-4" role="alert">
      <span class="alert-icon" aria-hidden="true">⚠</span>
      <div style="flex:1">
        <p style="font-weight:600;margin-bottom:4px">La auditoría no pudo completarse.</p>
        <p style="margin-bottom:8px">Suele pasar si el sitio no existe, tarda demasiado en responder o se corta la conexión. También se marca así lo que estaba corriendo si se reinició el servidor. Podés volver a intentarlo.</p>
        <button type="button" class="btn btn-primary btn-sm" data-accion="reauditar"><span aria-hidden="true">↻</span> Volver a auditar</button>
      </div>
    </div>` : ''}

    ${corriendo ? renderProgreso(a) : ''}

    <div class="stats-grid" style="margin-bottom:1.75rem" aria-label="Resumen ejecutivo">
      ${a.score != null
        ? `<div class="stat-card stat-card-teal" style="align-items:center;justify-content:center;padding-top:1.75rem;padding-bottom:1.75rem" role="figure" aria-label="Score de accesibilidad: ${a.score} — Nivel ${nivel(a.score).t}">
            ${scoreRing(a.score)}
            <div class="stat-card-label" style="margin-top:.5rem;text-align:center">Score de accesibilidad</div>
          </div>`
        : statCard({ icon: '📈', value: '—', label: 'Score de accesibilidad', sub: corriendo ? 'Calculando…' : 'No disponible' })}
      ${statCard({ icon: '🔍', value: completa ? hallazgos.length : '—', label: 'Hallazgos detectados', accent: !completa ? 'navy' : !hallazgos.length ? 'teal' : criticos ? 'danger' : 'warning' })}
      ${statCard({ icon: '📄', value: completa ? 1 : 0, label: 'Páginas analizadas', sub: 'Análisis del HTML de la URL' })}
      ${statCard({ icon: '⛔', value: completa ? criticos : '—', label: 'Críticos', accent: !completa ? 'navy' : criticos ? 'danger' : 'teal', sub: !completa ? (corriendo ? 'Esperando resultados…' : 'Sin páginas analizadas') : criticos ? 'Requieren atención urgente' : 'Sin hallazgos críticos 🎉' })}
    </div>

    <div role="tablist" aria-label="Secciones del detalle de auditoría" class="tabs-list">
      ${TABS.map((t) => `<button type="button" id="tab-${t.id}" role="tab" aria-selected="${tabActiva === t.id}" aria-controls="panel-${t.id}" class="tab-btn" data-tab="${t.id}" tabindex="${tabActiva === t.id ? 0 : -1}"><span aria-hidden="true">${t.icon}</span>${t.label}${t.id === 'hallazgos' ? `<span class="tab-count" aria-label="${hallazgos.length} ítems">${hallazgos.length}</span>` : ''}</button>`).join('')}
    </div>
    <div id="panel-${tabActiva}" role="tabpanel" aria-labelledby="tab-${tabActiva}" tabindex="0" class="page-enter">${paneles[tabActiva]()}</div>`);

  // Región fija: dentro de lo que se repinta, el lector de pantalla no anunciaría el avance.
  const anuncio = corriendo ? textoPaso(a.etapa) : completa ? `Auditoría completada. Puntaje ${a.score} de 100.` : 'La auditoría no pudo completarse.';
  const vivo = document.getElementById('anuncio');
  if (vivo.textContent !== anuncio) vivo.textContent = anuncio;
}

// --- Leaderboard (público) --------------------------------------------------
async function initLeaderboard() {
  const cont = document.getElementById('tabla');
  try {
    const dominios = await api('GET', '/leaderboard');
    // Un "puntaje" por dominio: el de su mejor auditoría pública.
    const filas = dominios.map((d) => {
      const auds = d.Auditoria || []; // Sequelize no pluraliza "Auditoria": el alias queda singular.
      const conScore = auds.filter((a) => a.score != null).map((a) => a.score);
      const score = conScore.length ? Math.max(...conScore) : null;
      const hallazgos = auds.reduce((s, a) => s + ((a.Hallazgos || []).length), 0);
      return { host: d.host, score, auds: conScore.length, hallazgos };
    }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

    const resumen = document.getElementById('resumen');
    const conScore = filas.filter((f) => f.score != null);
    resumen.innerHTML = `
      <div class="lb-summary"><div class="lb-summary-item"><div class="lb-summary-value">${filas.length}</div><div class="lb-summary-label">${filas.length === 1 ? 'Dominio público' : 'Dominios públicos'}</div></div>
      <div class="lb-summary-item"><div class="lb-summary-value">${conScore.length ? Math.round(conScore.reduce((s, f) => s + f.score, 0) / conScore.length) : '—'}</div><div class="lb-summary-label">Puntaje promedio</div></div>
      <div class="lb-summary-item"><div class="lb-summary-value">${filas.filter((f) => f.score != null && f.score >= 90).length}</div><div class="lb-summary-label">Con nivel Excelente</div></div></div>`;

    if (!filas.length) {
      cont.innerHTML = `<div class="empty-state"><div class="empty-state-icon" aria-hidden="true">📭</div><div class="empty-state-title">No hay dominios en el ranking aún</div><div class="empty-state-desc">Todavía no hay dominios públicos. Publicá un dominio desde el dashboard para aparecer acá.</div></div>`;
      return;
    }
    const medallas = ['🥇', '🥈', '🥉'];
    cont.innerHTML = `<div class="table-container" style="border:none;border-radius:0"><table class="table"><thead><tr><th style="width:3rem">#</th><th>Dominio</th><th>Puntaje</th><th>Nivel</th><th class="hide-mobile">Auditorías</th></tr></thead><tbody>${
      filas.map((f, i) => { const n = nivel(f.score); return `<tr class="${i < 3 ? 'lb-row-top' : ''}">
        <td><span class="leaderboard-rank ${['rank-gold', 'rank-silver', 'rank-bronze'][i] || ''}">${i < 3 ? `<span class="lb-medal">${medallas[i]}</span>` : i + 1}</span></td>
        <td><span class="lb-domain-link">${esc(f.host)}</span></td>
        <td><div class="score-bar-wrapper"><span style="font-weight:800;min-width:2.5rem">${f.score ?? '—'}</span><div class="score-bar-track"><div class="score-bar-fill" style="width:${Math.min(100, f.score || 0)}%;background:${n.color}"></div></div></div></td>
        <td><span class="badge" style="background:${n.bg};color:${n.text}">${n.t}</span></td>
        <td class="hide-mobile text-muted">${f.auds}</td>
      </tr>`; }).join('')
    }</tbody></table></div>`;
  } catch (ex) { show(cont, ex.message); }
}

// --- Dispatch por página ----------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page;
  if (!['login', 'register', 'leaderboard'].includes(page)) requireSession();
  mountHeader(page);
  ({ login: initLogin, register: initRegister, dashboard: initDashboard, audit: initAudit, leaderboard: initLeaderboard }[page] || (() => {}))();
});
