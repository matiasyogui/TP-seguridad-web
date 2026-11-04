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
| GET | `/api/v1/docs` | **no** | Swagger UI expuesto a propósito (A02) — recon del paso 1 |
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
**Suplantación de identidad y publicación de datos privados de terceros** (modelo *botín → llave*):
a partir de una documentación de API que no debía estar expuesta, se forja la identidad de la víctima
y se publica su auditoría privada en el leaderboard público, sin conocer ninguna credencial suya.

**Herramientas:** Burp Suite (interceptar y repetir peticiones, manipular el JWT) y Hashcat (ataque
offline sobre el secreto del JWT).

```
[A02] Security Misconfiguration (Swagger expuesto en /api/v1/docs, sin auth)
   │  → mapa completo de la API: endpoints, el 409/201 del register, id secuencial
[A07] Enumeración de usuarios   (registro 409 vs 201, id_usuario secuencial)
   │  → email confirmado + id de la víctima
[A07] Authentication Failures   (login sin rate-limit, password débil)
   │  → un JWT válido firmado por el server
[A04] Cryptographic Failures    (crackeo offline del secreto, JWT_SECRET=clave123)
   │  → el JWT_SECRET
[A01] Broken Access Control     (token forjado con sub = id de la víctima)
   │  → sesión de la víctima: lee y exporta sus auditorías privadas
[A06] Insecure Design           (auditoría asociada a un dominio ajeno + publicar el dominio)
   🏁  el leaderboard público expone la auditoría privada de la víctima
```

**Paso 1 — A02 Security Misconfiguration + A07 Enumeración de usuarios.** El recon arranca desde el
propio frontend: en DevTools → Network se ve que las llamadas salen a `/api/v1/...`. Fuzzeando rutas
convencionales aparece **Swagger UI público y sin auth** en `/api/v1/docs` (`src/openapi.js`), que lista
todos los endpoints. El register (`POST /api/v1/auth/register`) responde **409** si el email ya existe
y **201** si es nuevo: desde Burp Repeater se confirma qué emails son cuentas reales. Como el
`id_usuario` es un autoincrement secuencial, la víctima (la cuenta más antigua) tiene un id bajo y
acotable.
- *Entrada:* acceso HTTP a la app + un email candidato de la víctima.
- *Salida:* la API documentada + el `409` que confirma a la víctima + un rango acotado de IDs.
- *Para el paso siguiente:* el `id` de la víctima (el `sub` a forjar en el paso 4).

**Paso 2 — A07 Authentication Failures (sin rate-limit).** El login (`POST /api/v1/auth/login`) no
aplica rate-limiting ni bloqueo por intentos, y la política de contraseñas es débil (acepta
`password1`): se puede automatizar fuerza bruta con Burp Intruder. Como el registro es abierto, el mismo
JWT válido se obtiene registrándose; la fuerza bruta igual **acredita la ausencia de rate-limiting**.
- *Entrada:* un email válido + una lista de contraseñas.
- *Salida:* un `200` con un JWT válido firmado por el servidor.
- *Para el paso siguiente:* ese JWT, material para el crackeo offline.

**Paso 3 — A04 Cryptographic Failures (secreto débil).** El JWT está firmado con HS256 usando
`JWT_SECRET` (`clave123` en el laboratorio). Se ataca **offline** con Hashcat (modo `16500` = JWT), sin
contacto con el servidor, así que un rate-limit sería irrelevante.
```bash
echo "<token-del-paso-2>" > token.txt
hashcat -a 0 -m 16500 token.txt diccionario.txt
hashcat -m 16500 token.txt --show        # => ...:clave123
```
- *Entrada:* el JWT del paso 2.
- *Salida:* el `JWT_SECRET` en claro.
- *Para el paso siguiente:* la llave maestra para firmar tokens arbitrarios.

**Paso 4 — A01 Broken Access Control (token forjado).** La autorización confía únicamente en el claim
`sub`, sin sesión del lado del servidor ni tokens revocables. Con el secreto se firma un token cuyo
`sub` sea el id de la víctima y se inyecta en el navegador.
```bash
# forjar el token de la víctima (sub = id del paso 1)
node -e "console.log(require('jsonwebtoken').sign({sub:1},'clave123',{expiresIn:'1d'}))"
```
Inyectarlo en la web (F12 → Application → Local Storage → `a11yrank_token`) y recargar. Con ese token,
`GET /api/v1/audits` devuelve las auditorías privadas de la víctima y `…/export?format=csv` las exporta.
- *Entrada:* `JWT_SECRET` + id de la víctima.
- *Salida:* sesión válida con la identidad de la víctima; lectura y exportación de sus datos privados.
- *Para el paso siguiente:* el `id_dominio` de su dominio privado.

**Paso 5 — A06 Insecure Design (publicación de datos privados).** Al crear una auditoría se puede pasar
cualquier `dominio_id` (`POST /api/v1/audits`, `{ url, dominio_id }`), sin verificar que el dominio sea
propio (`src/server.js`). Operando como la víctima, se asocia una auditoría a su dominio privado y, como
la visibilidad se decide a nivel de dominio, `PATCH /api/v1/domains/:id/visibility` publica ese dominio
→ el leaderboard público (`GET /api/v1/leaderboard`) expone también sus auditorías privadas.
- *Entrada:* sesión de la víctima + `id_dominio` privado.
- *Salida:* la auditoría privada de la víctima queda expuesta en el ranking público.
- *Impacto final:* robo de cuenta sin credenciales + exposición pública de datos privados de terceros.

El detalle con la ubicación exacta en el código y las mitigaciones está en
[`SECURITY-NOTES.md`](./SECURITY-NOTES.md).
