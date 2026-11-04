# Cadena de vulnerabilidades — A11yRank Mini (Cadena 3 del TP)

Material del TP (UTN FRBA, Seguridad en Aplicaciones Web, Grupo 5). Las debilidades están puestas
a propósito; esta app es un laboratorio. Corresponde a la **Cadena 3** del documento
`TP-Cadenas-A11yRank.md`.

> 🟢 presente en el código tal cual · 🟡 hipótesis de laboratorio (secreto JWT débil).

## Resumen
**Suplantación de identidad y publicación de datos privados**, sin conocer la contraseña de la
víctima. Modelo *botín → llave*: lo que se obtiene en cada paso es la condición del siguiente.

```
[A02] Security Misconfiguration (Swagger /api/v1/docs expuesto sin auth)
   │  botín: superficie completa de la API (endpoints, 409/201, id secuencial)
   ▼
[A07] Enumeración de usuarios   (registro 409 vs 201, id_usuario secuencial)
   │  botín: email confirmado + id de la víctima
   ▼
[A07] Authentication Failures   (login sin límite de intentos)
   │  botín: un JWT válido firmado por el server
   ▼
[A04] Cryptographic Failures    (crackeo offline del secreto)
   │  botín: el JWT_SECRET
   ▼
[A01] Broken Access Control     (forjo el token de la víctima)
   │
   ▼
  🏁  Sesión de la víctima; se publica su auditoría privada
```

## Paso 1 — A02 Security Misconfiguration + A07 Enumeración de usuarios 🟢
**Descubrimiento (A02):** la documentación Swagger está expuesta **sin autenticación** en
`GET /api/v1/docs` (y el spec crudo en `/api/v1/openapi.json`). El atacante lee ahí la superficie
completa de la API: todos los endpoints, que `register` responde **409** vs **201**, y que la
respuesta incluye un `id_usuario` **secuencial**. No hace falta adivinar rutas.

**Confirmación (A07):** con ese mapa, `POST /api/v1/auth/register` responde **409** si el email ya
existe y **201** si es nuevo, así que se confirma qué cuentas existen. El `id_usuario` autoincrement
secuencial implica que la víctima (más antigua) tiene un id menor y acotable.

- **Entrada:** acceso HTTP a la app (el Swagger es público); un email candidato de la víctima.
- **Salida:** la API documentada + `409` que confirma la víctima + un rango acotado de IDs.
- **Hereda al paso 4:** el `id` de la víctima para el claim `sub`.
- **Dónde:** `src/server.js` → `/api/v1/docs` (Swagger) y `/auth/register`; spec en `src/openapi.js`.

## Paso 2 — A07 Authentication Failures (sin rate-limit) 🟢
El login no aplica rate-limiting ni bloqueo por intentos, y la política de contraseñas es débil
(`/^(?=.*[A-Za-z])(?=.*\d).{8,}$/`, acepta `password1`). Se puede automatizar fuerza bruta con Burp
Intruder sobre `password`.

- **Entrada:** un email válido + una lista de contraseñas.
- **Salida:** un `200` con un JWT válido.
- **Hereda al paso 3:** un JWT firmado con el secreto del server (material para el crackeo).
- **Nota (honestidad):** como el registro es abierto, el mismo JWT se obtiene registrándose; la
  fuerza bruta se mantiene porque **acredita la ausencia de rate-limiting**.
- **Dónde:** `src/server.js` → `/auth/login`.

## Paso 3 — A04 Cryptographic Failures (secreto débil) 🟡
Los JWT se firman con HS256 usando `JWT_SECRET` (`clave123` en el laboratorio) y la verificación no
fija `algorithms`. Con el token del paso 2 se ataca el secreto **offline** con hashcat (modo 16500),
sin contacto con el servidor.

```bash
echo "<token-del-paso-2>" > token.txt
hashcat -a 0 -m 16500 token.txt diccionario.txt
hashcat -m 16500 token.txt --show        # => ...:clave123
```

- **Entrada:** el token del paso 2.
- **Salida:** el `JWT_SECRET` en claro.
- **Hereda al paso 4:** el secreto → poder **firmar** tokens arbitrarios.
- **Dónde:** `.env` / `src/server.js` → `firmarToken`, `requireAuth`.

## Paso 4 — A01 Broken Access Control (token forjado) 🟢
La autorización se basa únicamente en el claim `sub`, sin sesión del lado del servidor ni `jti`
revocable. Con el secreto se forja un token para el `sub` de la víctima y se inyecta en el navegador
reemplazando `a11yrank_token` en `localStorage`. No hay IDOR directo: los endpoints filtran por
`usuario_id`, así que suplantar vía token forjado es el único camino a lo privado de la víctima.

```bash
# forjar el token de la víctima (sub = id del paso 1)
node -e "console.log(require('jsonwebtoken').sign({sub:1},'clave123',{expiresIn:'1d'}))"
```

1. Con ese token: `GET /api/v1/audits` devuelve las auditorías privadas de la víctima y
   `GET /api/v1/audits/:id/export?format=csv` las exporta.
2. Como remate, `PATCH /api/v1/domains/:id/visibility` publica el dominio privado de la víctima →
   el leaderboard público (`GET /api/v1/leaderboard`) expone su auditoría privada.

- **Entrada:** `JWT_SECRET` + `id` de la víctima.
- **Salida:** sesión de la víctima; exposición/publicación de sus datos privados.
- **Impacto final:** control de la cuenta ajena sin credenciales + datos privados expuestos.
- **Dónde:** `src/server.js` → `requireAuth`, `/audits`, `/domains/:id/visibility`, `/leaderboard`.

## Mitigaciones propuestas
| Paso | OWASP 2025 | Remediación principal |
|------|------------|-----------------------|
| 1 | A02 / A07 | No exponer Swagger en prod (o protegerlo con auth); respuesta de registro uniforme; IDs no adivinables (UUID) |
| 2 | A07 | Rate-limiting + bloqueo por intentos, MFA, política de contraseñas fuerte |
| 3 | A04 | Secreto de alta entropía en gestor de secretos, fijar `algorithms`, rotación |
| 4 | A01 | Sesiones revocables (`jti` server-side), no confiar en el `sub` crudo; verificar propiedad del recurso |
