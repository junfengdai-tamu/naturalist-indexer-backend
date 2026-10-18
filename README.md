# Naturalist Indexer Backend

Node.js REST service backed by the official iNaturalist API.

## Requirements

- Node.js 22 or later
- Docker and Docker Compose

## Run with Docker

```sh
docker compose up --build
```

This starts the REST backend on port `3000` and PostgreSQL with pgvector on port `5432`. PostgreSQL data persists in the `pgvector_data` Docker volume. The backend creates the `vector` extension and an `observations` table at startup. Set `PORT`, `DATABASE_URL`, or `INATURALIST_API_BASE_URL` in `.env` to override defaults.

To run only the database container, use `docker compose up -d pgvector`.

## REST API

```sh
curl http://localhost:3000/api/v1/health
```

Returns service status, version, timestamp, and database connectivity.

The `observations` table includes a pgvector `embedding` column. The embedding dimension and generation model have not been selected yet, so vector generation and a dimension-specific ANN index remain to be configured with the chosen model.
