require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./config/db');
const apiRoutes = require('./routes/api');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { startSimulator, generateSample } = require('./services/simulator');

const app = express();
const port = Number(process.env.PORT || 5000);

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json({ limit: '20kb' }));
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected', simulated: true });
  } catch (_error) {
    res.status(503).json({ status: 'degraded', database: 'unavailable', simulated: true });
  }
});
app.use('/api', apiRoutes);
app.use(notFound);
app.use(errorHandler);

const server = app.listen(port, async () => {
  console.log(`NetWatch API listening on http://localhost:${port}`);
  try {
    await pool.query('SELECT 1');
    console.log('MySQL connected; simulated monitoring enabled.');
    await generateSample();
    startSimulator();
  } catch (error) {
    console.error('MySQL is unavailable. Configure backend/.env and import database.sql before using data APIs.', error.message);
  }
});

async function shutdown() {
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = app;
