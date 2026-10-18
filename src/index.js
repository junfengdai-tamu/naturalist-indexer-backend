import express from 'express';

const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = express();

app.get('/api/v1/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'naturalist-indexer-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`REST API listening on http://0.0.0.0:${port}`);
});
