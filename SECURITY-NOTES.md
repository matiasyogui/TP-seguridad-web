# Cadena de vulnerabilidades — A11yRank Mini (Cadena 3 del TP)

Material del TP (UTN FRBA, Seguridad en Aplicaciones Web, Grupo 5). Las debilidades están puestas
a propósito; esta app es un laboratorio. Corresponde a la **Cadena 3** del documento
`TP-Cadenas-A11yRank.md` y sigue el orden de la propuesta preliminar.

> 🟢 presente en el código tal cual · 🟡 hipótesis de laboratorio (secreto JWT débil).

## Resumen
**Suplantación de identidad y publicación de datos privados**, sin conocer la contraseña de la
víctima. Modelo *botín → llave*: lo que se obtiene en cada paso es la condición del siguiente.

```
[A07:2025] Authentication Failures  (register abierto: 409/201, id secuencial, JWT en la respuesta)
   │  botín: un JWT propio válido + el id de la víctima
   ▼
[A04:2025] Cryptographic Failures   (secreto JWT débil; crackeo offline con hashcat)
   │  botín: el JWT_SECRET
   ▼
[A01:2025] Broken Access Control    (forjo el token de la víctima: sub = idVictima)
   │  botín: sesión de la víctima + id de su dominio privado
   ▼
[A06:2025] Insecure Design          (auditoría asociada a un dominio ajeno + publicar el dominio)
   🏁  el leaderboard público expone la auditoría privada de la víctima
```

## Paso 1 — A07:2025 Authentication Failures 🟢
No hace falta atacar el login ni ninguna credencial de la víctima: el propio alta de cuentas entrega
todo lo necesario.

**Superficie (misconfig de apoyo):** la documentación Swagger está expuesta **sin autenticación** en
`GET /api/v1/docs` (spec crudo en `/api/v1/openapi.json`), así que el atacante lee ahí todos los
endpoints sin adivinar rutas.

**Enumeración + token:** `POST /api/v1/auth/register` responde **409** si el email ya existe y **201**
si es nuevo (oráculo de enumeración), y tanto `register` como `login` devuelven un **JWT válido** en la
respuesta (`firmarToken`). El `id_usuario` es un autoincrement **secuencial**, así que la víctima (más
antigua) tiene un id menor y acotable. Registrando una cuenta propia se obtiene en el acto un token
legítimo firmado con el secreto del servidor.

- **Entrada:** acceso HTTP a la app (Swagger público); un email candidato de la víctima.
- **Salida:** `409` que confirma la víctima + IDs secuenciales + un JWT propio válido.
- **Hereda al paso 2:** el JWT como muestra para crackear el secreto offline.
- **Hereda al paso 3:** el `idVictima` para el claim `sub`.
- **Dónde:** `src/server.js` → `/api/v1/docs` (Swagger), `/auth/register`, `/auth/login`, `firmarToken`;
  spec en `src/openapi.js`.

## Paso 2 — A04:2025 Cryptographic Failures 🟡
Los JWT se firman con HS256 usando `JWT_SECRET` (`clave123` en el laboratorio) y la verificación no
fija `algorithms`. Con el token del paso 1 se ataca el secreto **offline** con hashcat (modo 16500), sin
contacto con el servidor.

```bash
echo "<jwt-del-paso-1>" > token.txt
hashcat -a 0 -m 16500 token.txt wordlists/rockyou_mini.txt   # demo; ataque real: wordlists/rockyou.txt
hashcat -m 16500 token.txt --show        # => ...:clave123
```

- **Entrada:** el JWT del paso 1.
- **Salida:** el `JWT_SECRET` en claro.
- **Hereda al paso 3:** el secreto → poder **firmar** tokens arbitrarios.
- **Dónde:** `.env` / `src/server.js` → `firmarToken`, `requireAuth`.

## Paso 3 — A01:2025 Broken Access Control 🟢
La autorización se basa únicamente en el claim `sub`, sin sesión del lado del servidor ni `jti`
revocable. Con el secreto se forja un token para el `sub` de la víctima y se inyecta en el navegador
reemplazando `a11yrank_token` en `localStorage`. No hay IDOR directo: los endpoints filtran por
`usuario_id`, así que suplantar vía token forjado es el único camino a lo privado de la víctima.

```bash
# forjar el token de la víctima (sub = idVictima del paso 1)
node -e "console.log(require('jsonwebtoken').sign({sub:1},'clave123',{expiresIn:'1d'}))"
```

Con ese token: `GET /api/v1/audits` devuelve las auditorías privadas de la víctima y
`GET /api/v1/audits/:id/export?format=csv` las exporta.

- **Entrada:** `JWT_SECRET` + `idVictima`.
- **Salida:** sesión de la víctima; lectura y exportación de sus datos privados.
- **Hereda al paso 4:** sesión de la víctima + `id_dominio` de su dominio privado.
- **Dónde:** `src/server.js` → `requireAuth`, `/audits`, `/audits/:id/export`.

## Paso 4 — A06:2025 Insecure Design 🟢
El modelo asocia la auditoría a un dominio pasando `dominio_id` en `POST /api/v1/audits`, **sin
verificar que el dominio sea propio**. Operando como la víctima se crea una auditoría apuntando a su
dominio privado y, como la visibilidad se decide a nivel de dominio,
`PATCH /api/v1/domains/:id/visibility` publica ese dominio → el leaderboard público
(`GET /api/v1/leaderboard`, sin auth) expone también sus auditorías privadas.

> Nota: la propuesta preliminar describe este paso con `PATCH /api/v1/audits/:id` + `domain_id`; este
> build no implementa ese endpoint. El mecanismo real es `POST /api/v1/audits` con `dominio_id`.

- **Entrada:** sesión de la víctima + `id_dominio` de un dominio privado.
- **Salida:** la auditoría privada de la víctima queda expuesta en el ranking público.
- **Impacto final:** control de la cuenta ajena sin credenciales + datos privados expuestos.
- **Dónde:** `src/server.js` → `/audits` (acepta `dominio_id` ajeno), `/domains/:id/visibility`, `/leaderboard`.

## Mitigaciones propuestas
| Paso | OWASP 2025 | Remediación principal |
|------|------------|-----------------------|
| 1 | A07 | No exponer Swagger en prod (o protegerlo); respuesta de registro uniforme; IDs no adivinables (UUID); no devolver el token en el registro sin verificación |
| 2 | A04 | Firma asimétrica (RS256) para que tener un token no dé poder de firmar; secreto de alta entropía en gestor de secretos; fijar `algorithms`; rotación |
| 3 | A01 | Sesiones revocables (`jti` server-side), no confiar en el `sub` crudo; verificar propiedad del recurso |
| 4 | A06 | Separar propiedad/visibilidad por auditoría; verificar que el `dominio_id` sea del usuario; publicar un dominio no debe exponer auditorías ajenas |
