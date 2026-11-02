# Naturalist Indexer Backend

Node.js REST service for semantic search over Texas reptile and amphibian passages, built from iNaturalist, GBIF and Wikipedia data.

## Requirements

- Node.js 22 or later
- Docker and Docker Compose

## Run with Docker

```sh
docker compose up --build
```

This starts the REST backend on port `3000` and PostgreSQL on port `5432`. PostgreSQL data persists in the `pgvector_data` Docker volume. The backend creates a `passages` table at startup. Set `PORT` or `DATABASE_URL` in `.env` to override defaults.

A `.env` file is optional; `docker-compose.yml` has defaults. The first start is slow: the backend downloads the embedding model and embeds every passage in `scripts/data/passages.csv` (checked into the repo) before it starts listening. Later starts skip this because the embeddings are already in the database.

## Run locally

```sh
npm install
docker compose up -d pgvector
npm start
```

The default `DATABASE_URL` points at `localhost:5432`. If you copy `.env.example` to `.env`, change the `pgvector` host in `DATABASE_URL` to `localhost`; that hostname only resolves inside Docker. `npm run dev` restarts on file changes.

## REST API

```sh
curl http://localhost:3000/api/v1/health
```

Returns service status, version, timestamp, and database connectivity.

### Semantic passage search

`POST /api/v1/passages/search` accepts a natural-language query and returns up to 20 passages ranked by cosine similarity.

```bash
curl -X POST http://localhost:3000/api/v1/passages/search \
  -H 'Content-Type: application/json' \
  -d '{"query":"Which Texas reptiles live near water?"}'
```

The response includes passage metadata, the matched text, and a `similarity` score for each result.

The `passages` table stores `passage_id`, `taxon_id`, `scientific_name`, `common_name`, `class`, `family`, `observation_count`, `passage_index`, `source`, and `text`. The `passage_embeddings` table stores vectors with their model ID and dimension, so results from different models can be compared side by side. The CSV is committed, so you only need `npm run collect` to refresh the data. It queries the iNaturalist, GBIF and Wikipedia APIs (rate-limited, so a cold run takes a long time), caches responses in `scripts/data/raw/` and writes `scripts/data/passages.csv`. Import only happens while the table is empty, so after regenerating the CSV, reset the database volume (`docker compose down -v`) to load it. When the backend starts and the table is empty, it imports this CSV and computes MiniLM embeddings locally with Transformers.js. The model is downloaded on first use and cached.

Embedding model adapters are registered in `src/services/embeddings.js`. At every backend startup, the service fills any missing vectors for every registered model and leaves existing embeddings intact. Add a model adapter there to have its vectors generated automatically on the next startup.
