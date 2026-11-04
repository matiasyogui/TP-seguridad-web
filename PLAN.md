# A11yRank Mini — Plan de versión mínima (TP Seguridad, Grupo 5)

> App **vulnerable a propósito**, con fines didácticos (estilo OWASP Juice Shop / DVWA).
> Reproduce la cadena del documento *Propuesta preliminar* y documenta sus mitigaciones.
> **Solo para laboratorio.** No desplegar en internet.

## Objetivo
Un repo público, mínimo y fácil de levantar (`npm install && npm run dev`, sin servicios
externos), que conserve **exactamente** las debilidades de la cadena A07→A04→A01→A06 y
permita un análisis de accesibilidad "sintáctico" simple en lugar del worker headless.

## Qué se CONSERVA (lo imprescindible para la cadena)
Las debilidades ya existen en el A11yRank real (`apps/api/.../auth.service.ts`), no se inventan:
- **Auth** register/login con JWT:
  - `register` responde **409** si el email existe y **201** si es nuevo → enumeración (**A07**).
  - `sub = id_usuario` (autoincrement secuencial) → IDs adivinables.
  - Firma con `JWT_SECRET` de env, débil → crackeable offline (**A04**).
  - Stateless, sin sesión revocable → token forjado = sesión válida (**A01**).
- **Audits**: crear / consultar / **export CSV** (el CSV hace falta para "exportar auditorías
  privadas de la víctima" del paso 3).
- **Domains**: asociar una auditoría a cualquier `domain_id` vía API, sin verificar propiedad (**A06** / BOLA).
- **Ranking/leaderboard**: publicar un dominio expone las auditorías asociadas (paso 4 final).

## Qué se SACA (nada de esto toca la cadena ni el análisis simple)
- Worker headless: Playwright + `@axe-core`, screenshots, IA vision, keyboard nav, bot-wall,
  scheduled poller.
- Email (nodemailer), PDF (pdfkit + export PDF), `sesionRemota`, `verificacion`, `apps/e2e`.
- → Elimina las dependencias más pesadas y la necesidad de navegador headless.

## Análisis "sintáctico simple" (reemplaza al worker)
> Hallazgo: en el A11yRank real el análisis lo hace **axe-core dentro de un navegador headless**
> (worker + Playwright). El `a11y/html.ts` del `shared` sólo traduce resultados de axe, no es un
> analizador reutilizable. Por eso el análisis simple se escribe de cero (es chico).

Módulo síncrono (`src/analyzer.js`): `fetch` del HTML + `cheerio`, con un puñado de reglas WCAG
sintácticas:
- `<img>` sin `alt`, `<html>` sin `lang`, controles sin label/`aria-label`, `<a>`/`<button>` sin
  texto, saltos de nivel en headings, página sin `<title>`.
- `score` 0–100 en función de las violaciones. Trae un self-check (`node src/analyzer.js`).
- Se ejecuta al crear la auditoría (sin cola ni worker) → más fácil de correr y explicar.

## Facilidad para compartir (decisiones a confirmar)
- **DB: SQLite** (archivo) en lugar de Postgres → cero setup externo. *(recomendado)*
- **Seed**: script con usuario(s) víctima + auditoría privada + dominio privado, para
  reproducir la cadena de entrada.
- `.env.example` con `JWT_SECRET` débil "de fábrica" (es intencional y está documentado).

## Mapa cadena → endpoints (Cadena 3 del TP)
| Paso | OWASP | Dónde |
|------|-------|-------|
| 1 | A07 Authentication Failures (enumeración) | `POST /api/v1/auth/register` (409 vs 201 + id secuencial) |
| 2 | A07 Authentication Failures (sin rate-limit) | `POST /api/v1/auth/login` (fuerza bruta, password débil) |
| 3 | A04 Cryptographic Failures  | crackeo JWT offline, `JWT_SECRET=clave123` (fuera de la app) |
| 4 | A01 Broken Access Control   | token forjado `sub=idVictima` en `localStorage`; GET/export + `PATCH /domains/:id/visibility` → leaderboard expone privadas |

## Estructura (app única, sin monorepo)
> Hallazgo: la DB real es **Oracle Autonomous (wallet)** y `audits.service` está acoplado a ~13
> modelos y al worker. Recortarlo sería frágil. Se rearma mínimo reusando sólo lo limpio
> (lógica de `auth.service`), en **una sola app Node/Express + SQLite + web estática**:
> un solo `npm install`, un solo `npm start`.

```
a11yrank-mini/
  package.json        una sola app: express + sequelize + sqlite3 + jsonwebtoken + bcryptjs + cheerio
  src/db.js           Sequelize/SQLite + modelos Usuario, Dominio, Auditoria, Hallazgo
  src/analyzer.js     análisis sintáctico + self-check
  src/server.js       express + rutas auth/audits/domains/leaderboard (debilidades intactas)
  src/seed.js         víctima + dominio privado + auditoría privada + (atacante)
  public/             web mínima estática: login, crear auditoría, leaderboard
  .env.example        JWT_SECRET débil "de fábrica" (intencional)
  README.md           setup + WARNING "app vulnerable a propósito, solo lab"
  SECURITY-NOTES.md   la cadena + mitigaciones (de la Propuesta preliminar)
```

## Decisiones (confirmadas)
1. Nombre: **`a11yrank-mini`**.
2. **Web mínima** (login, crear auditoría, leaderboard) — por el paso de `localStorage`.
3. **SQLite** (archivo local, cero setup externo).

## Siguiente paso
Confirmás las 3 decisiones y arranco el scaffolding copiando/recortando desde A11yRank
(sin tocar el repo A11yRank). El `git init` del repo nuevo lo hacés vos o te lo dejo listo cuando digas.
