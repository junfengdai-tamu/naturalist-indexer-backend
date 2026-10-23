# Naturalist Indexer Backend

Node.js REST service backed by the official iNaturalist API.

## Requirements

- Node.js 22 or later
- Docker and Docker Compose

## Run with Docker

```sh
docker compose up --build
```

This starts the REST backend on port `3000` and PostgreSQL on port `5432`. PostgreSQL data persists in the `pgvector_data` Docker volume. The backend creates a `passages` table at startup. Set `PORT`, `DATABASE_URL`, or `INATURALIST_API_BASE_URL` in `.env` to override defaults.

To run only the database container, use `docker compose up -d pgvector`.

## REST API

```sh
curl http://localhost:3000/api/v1/health
```

Returns service status, version, timestamp, and database connectivity.

The `passages` table stores `passage_id`, `taxon_id`, `scientific_name`, `common_name`, `class`, `family`, `observation_count`, `passage_index`, `source`, and `text`. The `passage_embeddings` table stores vectors with their model ID and dimension, so results from different models can be compared side by side. Generate the CSV with `node scripts/collect-species.js`; it writes to `scripts/data/passages.csv`. When the backend starts and the table is empty, it imports this CSV and computes MiniLM embeddings locally with Transformers.js. The model is downloaded on first use and cached.

Embedding model adapters are registered in `src/services/embeddings.js`. At every backend startup, the service fills any missing vectors for every registered model and leaves existing embeddings intact. Add a model adapter there to have its vectors generated automatically on the next startup.
