// Capa de datos: SQLite via Sequelize. Un archivo local (a11yrank.sqlite),
// cero setup externo. En el A11yRank real esto es Oracle Autonomous con wallet.
const path = require('node:path');
const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.resolve(__dirname, '../a11yrank.sqlite'),
  logging: false,
});

// id_usuario es autoincrement secuencial => IDs adivinables (parte de A07).
const Usuario = sequelize.define(
  'Usuario',
  {
    id_usuario: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    nombre: { type: DataTypes.STRING, allowNull: false },
    apellido: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password_hash: { type: DataTypes.STRING, allowNull: false },
  },
  { tableName: 'usuarios' }
);

// La visibilidad se decide a nivel de dominio (diseño inseguro, A06): publicar
// el dominio expone TODAS sus auditorías, sin importar quién las creó.
const Dominio = sequelize.define(
  'Dominio',
  {
    id_dominio: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    host: { type: DataTypes.STRING, allowNull: false },
    publico: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  },
  { tableName: 'dominios' }
);

const Auditoria = sequelize.define(
  'Auditoria',
  {
    id_auditoria: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    url: { type: DataTypes.STRING, allowNull: false },
    score: { type: DataTypes.INTEGER, allowNull: true },
    // EN_PROCESO | COMPLETADO | FALLIDO. El default cubre las filas anteriores a la columna.
    estado: { type: DataTypes.STRING, allowNull: false, defaultValue: 'COMPLETADO' },
    // Paso del análisis mientras está EN_PROCESO: descargando | reglas | puntaje.
    etapa: { type: DataTypes.STRING, allowNull: true },
    usuario_id: { type: DataTypes.INTEGER, allowNull: false },
    // Puede apuntar a CUALQUIER dominio, incluso de otro usuario (A06).
    dominio_id: { type: DataTypes.INTEGER, allowNull: true },
  },
  { tableName: 'auditorias' }
);

const Hallazgo = sequelize.define(
  'Hallazgo',
  {
    id_hallazgo: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    auditoria_id: { type: DataTypes.INTEGER, allowNull: false },
    regla: { type: DataTypes.STRING, allowNull: false },
    criterio: { type: DataTypes.STRING, allowNull: false },
    mensaje: { type: DataTypes.STRING, allowNull: false },
  },
  { tableName: 'hallazgos' }
);

Dominio.hasMany(Auditoria, { foreignKey: 'dominio_id' });
Auditoria.belongsTo(Dominio, { foreignKey: 'dominio_id' });
Auditoria.hasMany(Hallazgo, { foreignKey: 'auditoria_id' });
Hallazgo.belongsTo(Auditoria, { foreignKey: 'auditoria_id' });
Usuario.hasMany(Auditoria, { foreignKey: 'usuario_id' });
Usuario.hasMany(Dominio, { foreignKey: 'usuario_id' });

// sync() no agrega columnas a tablas existentes: sin esto una base anterior rompe
// y la única salida sería `npm run seed`, que la borra.
async function prepararBase() {
  await sequelize.sync();
  const qi = sequelize.getQueryInterface();
  const columnas = await qi.describeTable('auditorias');
  for (const nombre of ['estado', 'etapa']) {
    if (!columnas[nombre]) await qi.addColumn('auditorias', nombre, Auditoria.getAttributes()[nombre]);
  }
  // El análisis vive en memoria: lo que quedó corriendo al apagar ya no va a terminar.
  await Auditoria.update({ estado: 'FALLIDO', etapa: null }, { where: { estado: 'EN_PROCESO' } });
}

module.exports = { sequelize, prepararBase, Usuario, Dominio, Auditoria, Hallazgo };
