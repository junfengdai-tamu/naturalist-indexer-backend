import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpServer } from './mcp/server.js';

const port = Number.parseInt(process.env.PORT || '3000', 10);
const app = createMcpExpressApp({ host: '0.0.0.0' });

app.get('/api/v1/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'naturalist-indexer-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    mcpEndpoint: '/mcp',
  });
});

app.post('/mcp', async (request, response) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  response.on('close', () => {
    void transport.close();
    void server.close();
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch (error) {
    console.error('MCP request failed:', error);
    if (!response.headersSent) {
      response.status(500).json({ error: 'MCP request failed' });
    }
  }
});

for (const method of ['get', 'delete']) {
  app[method]('/mcp', (_request, response) => {
    response.status(405).json({ error: 'Method not allowed for stateless MCP endpoint' });
  });
}

app.listen(port, '0.0.0.0', () => {
  console.log(`REST API listening on http://0.0.0.0:${port}`);
  console.log(`MCP Streamable HTTP endpoint: http://0.0.0.0:${port}/mcp`);
});
