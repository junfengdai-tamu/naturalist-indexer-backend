import express from 'express';
import { initializeDatabase, pool } from './dao/database.js';
import { searchPassages } from './services/passage-search.js';
import { searchPassagesByBm25Query } from './services/bm25-passage-search.js';

const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = express();
app.use(express.json({ limit: '16kb' }));

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

const CLIENT_VISIBLE_STATUSES = new Set([400, 429, 502, 503]);

function sendSearchError(response, error, failureMessage) {
  if (CLIENT_VISIBLE_STATUSES.has(error.statusCode)) {
    if (error.retryAfterSeconds) response.set('Retry-After', String(error.retryAfterSeconds));
    return response.status(error.statusCode).json({ error: error.message });
  }
  console.error(`${failureMessage}:`, error);
  return response.status(500).json({ error: failureMessage });
}

app.post('/api/v1/passages/search/embedding', async (request, response) => {
  try {
    return response.json(await searchPassages(request.body?.query, request.body?.generate));
  } catch (error) {
    return sendSearchError(response, error, 'Passage search failed');
  }
});

app.post('/api/v1/passages/search/bm25', async (request, response) => {
  try {
    return response.json(await searchPassagesByBm25Query(request.body?.query, request.body?.generate));
  } catch (error) {
    return sendSearchError(response, error, 'BM25 passage search failed');
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
