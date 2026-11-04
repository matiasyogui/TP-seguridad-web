// Datos de laboratorio para reproducir la cadena. OJO: recrea la base (borra
// lo existente). Ejecutar: `npm run seed`.
const bcrypt = require('bcryptjs');
const { sequelize, Usuario, Dominio, Auditoria, Hallazgo } = require('./db');

async function main() {
  await sequelize.sync({ force: true });

  // Víctima => id_usuario = 1 (autoincrement secuencial, adivinable).
  const victima = await Usuario.create({
    nombre: 'Victoria', apellido: 'Ruiz', email: 'victima@frba.utn.edu.ar',
    password_hash: await bcrypt.hash('Victima123', 10),
  });

  // Atacante => id_usuario = 2. (En el TP se crea con POST /auth/register.)
  await Usuario.create({
    nombre: 'Ataque', apellido: 'Demo', email: 'atacante@frba.utn.edu.ar',
    password_hash: await bcrypt.hash('Atacante123', 10),
  });

  // Dominio PRIVADO de la víctima, con una auditoría privada.
  const dominio = await Dominio.create({ host: 'banco-secreto.example', usuario_id: victima.id_usuario, publico: false });
  const auditoria = await Auditoria.create({
    url: 'https://banco-secreto.example/panel', score: 55,
    usuario_id: victima.id_usuario, dominio_id: dominio.id_dominio,
  });
  await Hallazgo.bulkCreate([
    { auditoria_id: auditoria.id_auditoria, regla: 'img-alt', criterio: '1.1.1', mensaje: 'Imagen sin alt: <img src="grafico-interno.png">' },
    { auditoria_id: auditoria.id_auditoria, regla: 'html-lang', criterio: '3.1.1', mensaje: 'El elemento <html> no declara idioma (atributo lang).' },
  ]);

  console.log('Seed OK. Víctima id=1 (dominio privado id=%d, auditoría privada id=%d), atacante id=2.',
    dominio.id_dominio, auditoria.id_auditoria);
}

main().catch((e) => { console.error(e); process.exit(1); });
