import express from 'express';
import { initializeDatabase, pool } from './services/database.js';

const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = express();

app.get('/api/v1/health', async (_request, response) => {
  try {
    await pool.query('SELECT 1');
    response.json({
      status: 'ok',
      service: 'naturalist-indexer-backend',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      database: 'connected',
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    response.status(503).json({
      status: 'unavailable',
      service: 'naturalist-indexer-backend',
      database: 'disconnected',
    });
  }
});

initializeDatabase()
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`REST API listening on http://0.0.0.0:${port}`);
    });
  })
  .catch((error) => {
    console.error('Failed to initialize database:', error);
    process.exit(1);
  });
