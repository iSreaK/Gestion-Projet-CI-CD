require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

// --- Logging setup (winston) ---
const logDir = process.env.LOG_DIR || path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    new winston.transports.File({ filename: path.join(logDir, 'app.log') })
  ]
});

// Console log for development
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json()
    )
  }));
}

// --- Morgan HTTP logging in JSON ---
const accessLogStream = fs.createWriteStream(path.join(logDir, 'access.log'), { flags: 'a' });
morgan.token('body', (req) => JSON.stringify(req.body));
app.use(morgan((tokens, req, res) => {
  return JSON.stringify({
    remote_addr: tokens['remote-addr'](req, res),
    method: tokens.method(req, res),
    url: tokens.url(req, res),
    status: Number(tokens.status(req, res)),
    response_time: Number(tokens['response-time'](req, res)),
    user_agent: tokens['user-agent'](req, res),
    body: req.body
  });
}, { stream: accessLogStream }));

// --- DB config from env ---
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASS || '',
  database: process.env.DB_NAME || 'crud_app',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

let pool;

// --- Init database ---
async function initDatabase(retries = 10, delay = 5000) {
  while (retries) {
    try {
      pool = mysql.createPool(dbConfig);
      await pool.execute(`
        CREATE TABLE IF NOT EXISTS users (
          uuid VARCHAR(36) PRIMARY KEY,
          fullname VARCHAR(255) NOT NULL,
          study_level VARCHAR(255) NOT NULL,
          age INT NOT NULL
        )
      `);
      logger.info({ event: 'DB_INIT', message: 'Database initialized/connected' });
      console.log('Base de données initialisée');
      return;
    } catch (error) {
      console.error(`DB init failed (${retries} retries left):`, error.message);
      retries -= 1;
      await new Promise(res => setTimeout(res, delay));
    }
  }
  process.exit(1);
}

// --- Validation helper ---
function validateUser(userData) {
  if (!userData || typeof userData !== 'object') return { valid: false, errors: ['Payload invalid'] };
  const errors = [];
  const { fullname, study_level, age } = userData;

  if (!fullname || typeof fullname !== 'string' || fullname.trim().length < 2)
    errors.push('fullname is required (string min 2 chars)');
  if (!study_level || typeof study_level !== 'string' || study_level.trim().length < 1)
    errors.push('study_level is required (string)');
  if (age === undefined || age === null || Number.isNaN(Number(age)))
    errors.push('age is required and must be a number');
  else if (!Number.isInteger(Number(age)) || age < 0 || age > 150)
    errors.push('age must be an integer between 0 and 150');

  return { valid: errors.length === 0, errors };
}

// --- Error handler ---
function handleError(res, loggerObj, err, status = 500, message = 'Internal Server Error') {
  logger.error({ ...loggerObj, message: err?.message ?? message, stack: err?.stack });
  return res.status(status).json({ error: message });
}

// --- Routes ---
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await pool.execute('SELECT * FROM users');
    logger.info({ event: 'LIST_USERS', endpoint: '/api/users', count: rows.length });
    res.json(rows);
  } catch (error) {
    handleError(res, { event: 'LIST_USERS_ERROR', endpoint: '/api/users' }, error, 500, 'Unable to list users');
  }
});

app.get('/api/users/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const [rows] = await pool.execute('SELECT * FROM users WHERE uuid = ?', [uuid]);
    if (rows.length === 0) {
      logger.warn({ event: 'GET_USER_NOT_FOUND', uuid, endpoint: `/api/users/${uuid}` });
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    logger.info({ event: 'GET_USER', uuid });
    res.json(rows[0]);
  } catch (error) {
    handleError(res, { event: 'GET_USER_ERROR', endpoint: `/api/users/${req.params.uuid}` }, error, 500, 'Error fetching user');
  }
});

app.post('/api/users', async (req, res) => {
  try {
    const { fullname, study_level, age } = req.body;
    const { valid, errors } = validateUser({ fullname, study_level, age });
    if (!valid) {
      logger.warn({ event: 'CREATE_USER_VALIDATION_FAILED', errors });
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const uuid = uuidv4();
    await pool.execute(
      'INSERT INTO users (uuid, fullname, study_level, age) VALUES (?, ?, ?, ?)',
      [uuid, fullname.trim(), study_level.trim(), Number(age)]
    );

    const newUser = { uuid, fullname: fullname.trim(), study_level: study_level.trim(), age: Number(age) };
    logger.info({ event: 'CREATE_USER', uuid, fullname: newUser.fullname });
    res.status(201).json(newUser);
  } catch (error) {
    handleError(res, { event: 'CREATE_USER_ERROR' }, error, 500, 'Error creating user');
  }
});

app.put('/api/users/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const { fullname, study_level, age } = req.body;
    const { valid, errors } = validateUser({ fullname, study_level, age });

    if (!valid) {
      logger.warn({ event: 'UPDATE_USER_VALIDATION_FAILED', uuid, errors });
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const [rows] = await pool.execute('SELECT * FROM users WHERE uuid = ?', [uuid]);
    if (rows.length === 0) {
      logger.warn({ event: 'UPDATE_USER_NOT_FOUND', uuid });
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    await pool.execute(
      'UPDATE users SET fullname = ?, study_level = ?, age = ? WHERE uuid = ?',
      [fullname.trim(), study_level.trim(), Number(age), uuid]
    );

    const updatedUser = { uuid, fullname: fullname.trim(), study_level: study_level.trim(), age: Number(age) };
    logger.info({ event: 'UPDATE_USER', uuid });
    res.json({ message: 'Utilisateur mis à jour', user: updatedUser });
  } catch (error) {
    handleError(res, { event: 'UPDATE_USER_ERROR', uuid: req.params.uuid }, error, 500, 'Error updating user');
  }
});

app.delete('/api/users/:uuid', async (req, res) => {
  try {
    const { uuid } = req.params;
    const [result] = await pool.execute('DELETE FROM users WHERE uuid = ?', [uuid]);
    const affectedRows = result.affectedRows ?? result.affected_rows ?? 0;
    if (affectedRows === 0) {
      logger.warn({ event: 'DELETE_USER_NOT_FOUND', uuid });
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    logger.info({ event: 'DELETE_USER', uuid });
    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    handleError(res, { event: 'DELETE_USER_ERROR', uuid: req.params.uuid }, error, 500, 'Error deleting user');
  }
});

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.execute('SELECT 1');
    logger.info({ event: 'HEALTH_CHECK', status: 'ok' });
    res.json({ status: 'OK', database: 'connected' });
  } catch (error) {
    logger.error({ event: 'HEALTH_CHECK_ERROR', message: error.message });
    res.status(500).json({ status: 'ERROR', database: 'disconnected' });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  logger.error({ event: 'UNHANDLED_ERROR', message: err.message, stack: err.stack });
  res.status(500).json({ error: 'Unhandled server error' });
});

// Start server
app.listen(PORT, async () => {
  await initDatabase();
  console.log(`Serveur démarré sur le port ${PORT}`);

  // --- Test logs ---
  const axios = require('axios');
  try { await axios.get(`http://localhost:${PORT}/health`); } catch {}
  logger.info({ event: 'TEST_LOG_INFO', message: 'Log info de test généré au démarrage' });
  logger.warn({ event: 'TEST_LOG_WARN', message: 'Log warning de test généré au démarrage' });
  logger.error({ event: 'TEST_LOG_ERROR', message: 'Log error de test généré au démarrage' });
});
