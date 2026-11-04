// Análisis de accesibilidad "sintáctico simple": descarga el HTML y aplica un
// puñado de reglas WCAG sobre el markup (sin navegador headless, sin axe-core).
// Reemplaza al worker + Playwright del A11yRank real.
const cheerio = require('cheerio');

// Reglas sintácticas. Cada una devuelve 0+ hallazgos sobre el DOM cargado.
const REGLAS = [
  {
    id: 'img-alt',
    criterio: '1.1.1',
    evaluar: ($) =>
      $('img:not([alt])')
        .toArray()
        .map((el) => `Imagen sin atributo alt: <img src="${$(el).attr('src') || ''}">`),
  },
  {
    id: 'html-lang',
    criterio: '3.1.1',
    evaluar: ($) =>
      $('html[lang]').length ? [] : ['El elemento <html> no declara idioma (atributo lang).'],
  },
  {
    id: 'doc-title',
    criterio: '2.4.2',
    evaluar: ($) =>
      ($('head title').text() || '').trim() ? [] : ['La página no tiene un <title> con texto.'],
  },
  {
    id: 'control-sin-nombre',
    criterio: '4.1.2',
    evaluar: ($) =>
      $('input:not([type=hidden]), select, textarea')
        .toArray()
        .filter((el) => {
          const $el = $(el);
          const id = $el.attr('id');
          const tieneLabel = id && $(`label[for="${id}"]`).length > 0;
          return !(tieneLabel || $el.attr('aria-label') || $el.attr('aria-labelledby') || $el.attr('title'));
        })
        .map((el) => `Control de formulario sin etiqueta accesible: <${el.tagName}>`),
  },
  {
    id: 'enlace-sin-texto',
    criterio: '2.4.4',
    evaluar: ($) =>
      $('a[href]')
        .toArray()
        .filter((el) => {
          const $el = $(el);
          return !(($el.text() || '').trim() || $el.attr('aria-label') || $el.attr('title') || $el.find('img[alt]').filter((_, i) => ($(i).attr('alt') || '').trim()).length);
        })
        .map(() => 'Enlace sin texto perceptible (<a> vacío).'),
  },
  {
    id: 'boton-sin-texto',
    criterio: '4.1.2',
    evaluar: ($) =>
      $('button')
        .toArray()
        .filter((el) => {
          const $el = $(el);
          return !(($el.text() || '').trim() || $el.attr('aria-label') || $el.attr('title'));
        })
        .map(() => 'Botón sin texto perceptible (<button> vacío).'),
  },
  {
    id: 'headings-orden',
    criterio: '1.3.1',
    evaluar: ($) => {
      const niveles = $('h1,h2,h3,h4,h5,h6')
        .toArray()
        .map((el) => Number(el.tagName[1]));
      const hallazgos = [];
      for (let i = 1; i < niveles.length; i++) {
        if (niveles[i] - niveles[i - 1] > 1) {
          hallazgos.push(`Salto en la jerarquía de encabezados: h${niveles[i - 1]} → h${niveles[i]}.`);
        }
      }
      return hallazgos;
    },
  },
];

/** Analiza un string HTML y devuelve { score, hallazgos }. */
function analizarHtml(html) {
  const $ = cheerio.load(html);
  const hallazgos = [];
  for (const regla of REGLAS) {
    for (const mensaje of regla.evaluar($)) {
      hallazgos.push({ regla: regla.id, criterio: regla.criterio, mensaje });
    }
  }
  // Score simple: cada hallazgo resta 3% de lo que queda, así un sitio real no se clava en 0.
  const score = Math.round(100 * 0.97 ** hallazgos.length);
  return { score, hallazgos };
}

/** Descarga el HTML. El timeout evita que un sitio colgado deje la auditoría en proceso para siempre. */
async function descargarHtml(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': 'A11yRank-Mini/0.1' }, signal: AbortSignal.timeout(20_000) });
  return resp.text();
}

module.exports = { analizarHtml, descargarHtml };

// Self-check: `node src/analyzer.js`. Un HTML con 3 problemas conocidos.
if (require.main === module) {
  const assert = require('node:assert');
  const html = `<!doctype html><html><head></head><body>
    <img src="logo.png">
    <h1>Hola</h1><h3>Sub</h3>
    <a href="/x"></a>
  </body></html>`;
  const { score, hallazgos } = analizarHtml(html);
  const ids = hallazgos.map((h) => h.regla).sort();
  // Esperados: img sin alt, sin lang, sin title, salto h1->h3, enlace sin texto.
  assert.deepStrictEqual(ids, ['doc-title', 'enlace-sin-texto', 'headings-orden', 'html-lang', 'img-alt']);
  assert.strictEqual(score, 86);
  assert.strictEqual(analizarHtml('<html lang="es"><head><title>t</title></head></html>').score, 100);
  console.log('analyzer self-check OK:', { score, hallazgos: ids });
}
