# Naturalist Indexer Backend

Node.js service with a REST health endpoint and a stateless MCP Streamable HTTP server. The MCP tool searches public observations through the official iNaturalist API.

## Requirements

- Node.js 22 or later
- Docker (optional)

## Run locally

```sh
npm install
npm start
```

The service listens on port `3000` by default. Set `PORT` to change it. `INATURALIST_API_BASE_URL` can override the iNaturalist API base URL for development.

## REST API

```sh
curl http://localhost:3000/api/v1/health
```

Returns service status, version, timestamp, and the MCP endpoint path.

## MCP Server

Connect an MCP client using the Streamable HTTP endpoint `http://localhost:3000/mcp`.

Tool: `search_inaturalist_observations`

- `query` (string, required): search text such as a species name
- `perPage` (integer, optional, 1–30, default 10): number of observations to return

## Docker

```sh
docker build -t naturalist-indexer-backend .
docker run --rm -p 3000:3000 naturalist-indexer-backend
```

Then open `http://localhost:3000/api/v1/health`; configure MCP clients with `http://localhost:3000/mcp`.
