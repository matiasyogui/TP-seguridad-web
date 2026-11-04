# A11yRank Mini

Versión mínima de **A11yRank** (auditoría de accesibilidad web) para el Trabajo Práctico de
**Seguridad en Aplicaciones Web** — UTN FRBA, K5561, Grupo 5.

> ⚠️ **Esta aplicación es vulnerable a propósito, con fines didácticos (estilo OWASP Juice Shop
> / DVWA).** Reproduce una cadena de vulnerabilidades documentada en [`SECURITY-NOTES.md`](./SECURITY-NOTES.md).
> **No la desplegues en internet ni la uses con datos reales.** Corré las demos en una VM/entorno de laboratorio.

## Qué hace
- Registro/login con JWT.
- Alta de auditorías: descarga el HTML de una URL y aplica un **análisis sintáctico simple** de
  accesibilidad (reglas WCAG sobre el markup, sin navegador headless). Corre en segundo plano y
  la web muestra el avance en vivo.
- Dominios y un **leaderboard** público.

## Requisitos
- Node.js ≥ 20 (trae `fetch` nativo).

## Puesta en marcha
```bash
npm install
cp .env.example .env     # en Windows: copy .env.example .env
npm run seed             # crea la base SQLite con datos de laboratorio (víctima id=1, atacante id=2)
npm start                # http://localhost:3000
```
Abrí `http://localhost:3000` para la web, o usá la API directamente (curl/Burp).

**Si ya tenías el proyecto andando:** alcanza con reiniciar el servidor (`npm start`). Las columnas
nuevas se agregan solas a la base y tus auditorías quedan como completadas; no hace falta `npm run seed`,
que además borra la base.

### Variables de entorno
| Variable | Default | Para qué |
|----------|---------|----------|
| `PORT` | `3000` | Puerto del servidor |
| `JWT_SECRET` | `clave123` | Débil a propósito (A04). No lo cambies para reproducir la cadena |
| `JWT_EXPIRES_IN` | `1d` | Duración del token |
| `ANALISIS_PASO_MS` | `1200` | Pausa artificial por paso del análisis, para que el progreso se vea en la demo. `0` = velocidad real |

## Cómo lanzar y seguir una auditoría
1. Ingresá con una cuenta de laboratorio.
2. En el dashboard, tocá **+ Nueva auditoría**, escribí la URL (alcanza con `ejemplo.com`) y tocá
   **Iniciar auditoría**.
3. Vas al detalle de la auditoría, que muestra la barra de avance y estos pasos:
   descarga del HTML → reglas WCAG → cálculo del puntaje.
4. Al terminar aparecen los resultados, sin recargar:
   - **Resumen:** distribución por severidad y qué corregir primero.
   - **Hallazgos:** problemas agrupados por regla.
   - **Benchmark:** hacer público o privado el dominio en el leaderboard.
5. Con la auditoría completa podés exportarla con **↓ CSV**, o repetirla con **Volver a auditar**.

En el dashboard, lo que está corriendo aparece en un banner, en la tarjeta **En proceso** y en la fila
de la tabla, y se puede filtrar con **En curso**. La lista se actualiza sola.

### Estados de una auditoría
| Estado | Significado |
|--------|-------------|
| `EN_PROCESO` | Se está analizando. `etapa` indica el paso: `descargando`, `reglas` o `puntaje` |
| `COMPLETADO` | Terminó y tiene `score` y hallazgos |
| `FALLIDO` | No se pudo completar: sitio caído, más de 20 s sin responder, o servidor reiniciado a mitad del análisis |

### Seguir una auditoría por API
`POST /api/v1/audits` responde enseguida, sin `score` ni hallazgos. El resultado se consulta después:
```bash
curl -X POST localhost:3000/api/v1/audits -H "Authorization: Bearer $TOKEN"   -H "Content-Type: application/json" -d '{"url":"https://example.com"}'
# 201 → { "id_auditoria": 7, "estado": "EN_PROCESO", "etapa": "descargando", "score": null, ... }

curl localhost:3000/api/v1/audits/7 -H "Authorization: Bearer $TOKEN"
# Repetir hasta que estado sea COMPLETADO o FALLIDO.
```

## Cuentas de laboratorio (tras `npm run seed`)
| Rol | Email | Password | id |
|-----|-------|----------|----|
| Víctima | `victima@frba.utn.edu.ar` | `Victima123` | 1 |
| Atacante | `atacante@frba.utn.edu.ar` | `Atacante123` | 2 |

La víctima tiene un dominio **privado** (`banco-secreto.example`, id 1) con una auditoría privada.

## Endpoints
| Método | Ruta | Auth | Nota |
|--------|------|------|------|
| GET | `/api/v1/docs` | **no** | Swagger UI expuesto a propósito — recon del Paso 1 (A07) |
| GET | `/api/v1/openapi.json` | no | el spec OpenAPI crudo |
| POST | `/api/v1/auth/register` | no | 409 si el email existe, 201 si es nuevo |
| POST | `/api/v1/auth/login` | no | |
| POST | `/api/v1/audits` | sí | `{ url, dominio_id? }` — lanza el análisis en segundo plano (`estado: EN_PROCESO`) |
| GET | `/api/v1/audits` | sí | auditorías del `sub` del token |
| GET | `/api/v1/audits/:id` | sí | `estado`, `etapa` y, al completar, `score` y hallazgos |
| GET | `/api/v1/audits/:id/export?format=csv` | sí | export CSV |
| POST | `/api/v1/domains` | sí | |
| GET | `/api/v1/domains` | sí | |
| PATCH | `/api/v1/domains/:id/visibility` | sí | publica el dominio (expone sus auditorías) |
| GET | `/api/v1/leaderboard` | no | dominios públicos + sus auditorías |

## Cadena de vulnerabilidades (Cadena 3)
**Suplantación de identidad y publicación de datos privados de terceros** (modelo *botín → llave*, cada
salida es la entrada del paso siguiente): a partir de una cuenta propia se forja la identidad de la
víctima y se publica su auditoría privada en el leaderboard público, sin conocer ninguna credencial suya.

**Herramientas:** Burp Suite (interceptar y repetir peticiones, manipular el JWT) y Hashcat (ataque
offline sobre el secreto del JWT, con `wordlists/rockyou_mini.txt` para la demo o `wordlists/rockyou.txt`
para el ataque completo).

### Paso 1 — A07:2025 Authentication Failures
Con `POST /api/v1/auth/register` se enumeran cuentas: responde **409** si el email ya existe y **201** si
es nuevo, confirmando desde Burp Repeater qué emails son reales. La superficie de la API se lee del
**Swagger expuesto sin auth** en `/api/v1/docs` (`src/openapi.js`). Registrando cuentas propias se ve que
el `id_usuario` es un autoincrement **secuencial** (la víctima, la cuenta más antigua, tiene un id bajo y
acotable) y que el **JWT viene en la respuesta** (`firmarToken` en `src/server.js`). Así se obtiene, sin
tocar credenciales de la víctima, un token válido propio.
- *Entrada:* acceso HTTP a la app + un email candidato de la víctima.
- *Salida:* el `409` que confirma a la víctima + evidencia de IDs secuenciales + un JWT propio válido.
- *Dato para el paso siguiente:* el JWT (muestra para el crackeo) y el `idVictima` (el `sub` a forjar).

### Paso 2 — A04:2025 Cryptographic Failures
El JWT está firmado con HS256 usando un `JWT_SECRET` débil (`clave123` en el laboratorio). Se ataca
**offline** con Hashcat (modo `16500` = JWT), sin contacto con el servidor, así que un rate-limit sería
irrelevante.
```bash
echo "<jwt-del-paso-1>" > token.txt
hashcat -a 0 -m 16500 token.txt wordlists/rockyou_mini.txt   # demo; ataque real: wordlists/rockyou.txt
hashcat -m 16500 token.txt --show        # => ...:clave123
```
- *Entrada:* un JWT válido firmado por el servidor (el de la cuenta propia).
- *Salida:* el `JWT_SECRET` en claro (secreto débil recuperado en segundos).
- *Dato para el paso siguiente:* el secreto, la llave maestra para firmar tokens arbitrarios.

### Paso 3 — A01:2025 Broken Access Control
La autorización confía únicamente en el claim `sub`, sin sesión del lado del servidor ni tokens
revocables. Con el secreto se firma un token cuyo `sub` sea el `idVictima` y se inyecta en el navegador.
```bash
# forjar el token de la víctima (sub = idVictima del paso 1)
node -e "console.log(require('jsonwebtoken').sign({sub:1},'clave123',{expiresIn:'1d'}))"
```
Inyectarlo en la web (F12 → Application → Local Storage → `a11yrank_token`) y recargar. Con ese token,
`GET /api/v1/audits` devuelve las auditorías privadas de la víctima y `…/export?format=csv` las exporta.
- *Entrada:* `JWT_SECRET` + `idVictima`.
- *Salida:* sesión válida con la identidad de la víctima; lectura y exportación de sus datos privados.
- *Dato para el paso siguiente:* el `id_dominio` de su dominio privado.

### Paso 4 — A06:2025 Insecure Design
Al crear una auditoría se puede pasar cualquier `dominio_id` (`POST /api/v1/audits`, `{ url, dominio_id }`),
sin verificar que el dominio sea propio (`src/server.js`). Operando como la víctima, se asocia una
auditoría a su dominio privado y, como la visibilidad se decide a nivel de dominio,
`PATCH /api/v1/domains/:id/visibility` publica ese dominio → el leaderboard público
(`GET /api/v1/leaderboard`) expone también sus auditorías privadas.
- *Entrada:* sesión de la víctima + `id_dominio` privado.
- *Salida:* la auditoría privada de la víctima queda expuesta en el ranking público.
- *Impacto final:* robo de cuenta sin credenciales + exposición pública de datos privados de terceros.

El detalle con la ubicación exacta en el código y las mitigaciones está en
[`SECURITY-NOTES.md`](./SECURITY-NOTES.md).
