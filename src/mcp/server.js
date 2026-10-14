import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { searchObservations } from '../services/inaturalist.js';

export function createMcpServer() {
  const server = new McpServer({
    name: 'naturalist-indexer',
    version: '1.0.0',
  });

  server.registerTool(
    'search_inaturalist_observations',
    {
      title: 'Search iNaturalist observations',
      description: 'Search public iNaturalist observations by species name or other text.',
      inputSchema: {
        query: z.string().trim().min(1).max(200)
          .describe('Text to search for, such as a species name'),
        perPage: z.number().int().min(1).max(30).default(10)
          .describe('Maximum number of observations to return (1–30)'),
      },
    },
    async ({ query, perPage }) => {
      try {
        const result = await searchObservations({ query, perPage });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result,
        };
      } catch (error) {
        return {
          content: [{ type: 'text', text: `iNaturalist search failed: ${error.message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}
