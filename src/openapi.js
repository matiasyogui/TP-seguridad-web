// Spec OpenAPI de A11yRank Mini. VULNERABLE A PROPOSITO (TP Seguridad).
// A02 Security Misconfiguration: se expone en /api/v1/docs SIN auth. Documenta
// toda la superficie de la API (incluido el 409 vs 201 del register y el
// id_usuario secuencial), de modo que el Paso 1 de la Cadena 3 arranca leyendo
// este Swagger y luego se confirma la victima con la enumeracion.
const Bearer = [{ bearerAuth: [] }];
const usuario = {
  type: 'object',
  properties: {
    id_usuario: { type: 'integer', example: 1, description: 'Autoincrement SECUENCIAL: la cuenta mas antigua (la victima) tiene el id mas bajo.' },
    nombre: { type: 'string' },
    apellido: { type: 'string' },
    email: { type: 'string', format: 'email' },
  },
};
const authResponse = {
  type: 'object',
  properties: { token: { type: 'string', description: 'JWT HS256 firmado con JWT_SECRET.' }, usuario },
};

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'A11yRank Mini API (LABORATORIO — vulnerable a proposito)',
    version: '0.1.0',
    description:
      'Auditoria de accesibilidad web. App deliberadamente vulnerable para el TP de Seguridad (UTN FRBA, Grupo 5). ' +
      'Esta documentacion queda expuesta sin autenticacion (A02 Security Misconfiguration): es parte del laboratorio.',
  },
  servers: [{ url: '/api/v1' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: { Usuario: usuario, AuthResponse: authResponse },
  },
  paths: {
    '/health': { get: { tags: ['meta'], summary: 'Healthcheck', security: [], responses: { 200: { description: 'ok' } } } },
    '/auth/register': {
      post: {
        tags: ['auth'],
        summary: 'Registro de usuario',
        description:
          'A07/A02: responde 409 si el email YA existe y 201 si es nuevo => permite enumerar cuentas. ' +
          'La respuesta 201 incluye id_usuario secuencial.',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['nombre', 'apellido', 'email', 'password'],
            properties: {
              nombre: { type: 'string', example: 'A' },
              apellido: { type: 'string', example: 'A' },
              email: { type: 'string', format: 'email', example: 'atacante@frba.utn.edu.ar' },
              password: { type: 'string', example: 'password1', description: 'Politica debil: >=8, una letra y un numero (acepta "password1").' },
            },
          } } },
        },
        responses: {
          201: { description: 'Cuenta creada (email libre)', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          409: { description: 'Ya existe una cuenta con ese email (CONFIRMA que la cuenta existe)' },
          400: { description: 'Faltan campos o la contrasena no cumple la politica' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['auth'],
        summary: 'Login',
        description: 'A07: sin rate-limit ni bloqueo por intentos => fuerza bruta.',
        security: [],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: {
            type: 'object',
            required: ['email', 'password'],
            properties: { email: { type: 'string', format: 'email' }, password: { type: 'string' } },
          } } },
        },
        responses: {
          200: { description: 'Token JWT', content: { 'application/json': { schema: { $ref: '#/components/schemas/AuthResponse' } } } },
          401: { description: 'Credenciales invalidas' },
        },
      },
    },
    '/audits': {
      get: { tags: ['audits'], summary: 'Mis auditorias (segun el sub del token)', security: Bearer, responses: { 200: { description: 'Lista de auditorias del sub del token' }, 401: { description: 'Token faltante o invalido' } } },
      post: {
        tags: ['audits'],
        summary: 'Crear auditoria (lanza el analisis en segundo plano)',
        description: 'Responde enseguida con estado EN_PROCESO. El avance se consulta con GET /audits/{id}: etapa (descargando, reglas, puntaje) y estado final COMPLETADO o FALLIDO.',
        security: Bearer,
        requestBody: { required: true, content: { 'application/json': { schema: {
          type: 'object', required: ['url'],
          properties: { url: { type: 'string', example: 'https://www.wikipedia.org' }, dominio_id: { type: 'integer', nullable: true } },
        } } } },
        responses: { 201: { description: 'Auditoria creada, en proceso' }, 400: { description: 'URL invalida' }, 401: { description: 'No autorizado' } },
      },
    },
    '/audits/{id}': { get: { tags: ['audits'], summary: 'Detalle de auditoria', security: Bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { 200: { description: 'Auditoria con hallazgos' }, 404: { description: 'No encontrada (o no es del sub del token)' } } } },
    '/audits/{id}/export': { get: { tags: ['audits'], summary: 'Exportar auditoria a CSV', security: Bearer, parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }, { name: 'format', in: 'query', schema: { type: 'string', example: 'csv' } }], responses: { 200: { description: 'CSV', content: { 'text/csv': {} } }, 404: { description: 'No encontrada' } } } },
    '/domains': {
      get: { tags: ['domains'], summary: 'Mis dominios', security: Bearer, responses: { 200: { description: 'Lista de dominios del sub del token' } } },
      post: { tags: ['domains'], summary: 'Crear dominio', security: Bearer, requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', required: ['host'], properties: { host: { type: 'string', example: 'ejemplo.com' } } } } } }, responses: { 201: { description: 'Dominio creado (privado)' } } },
    },
    '/domains/{id}/visibility': {
      patch: {
        tags: ['domains'],
        summary: 'Cambiar visibilidad del dominio (publicar)',
        description: 'A01: solo valida el sub del token, no la propiedad real. Publicar expone las auditorias asociadas en el leaderboard.',
        security: Bearer,
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }],
        requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { publico: { type: 'boolean', example: true } } } } } },
        responses: { 200: { description: 'Dominio actualizado' }, 404: { description: 'No encontrado' } },
      },
    },
    '/leaderboard': { get: { tags: ['leaderboard'], summary: 'Leaderboard publico (sin auth)', security: [], responses: { 200: { description: 'Dominios publicos + sus auditorias' } } } },
  },
};
