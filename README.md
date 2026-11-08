# Naturalist Indexer Backend

Node.js REST service for semantic search over Texas reptile and amphibian passages, built from iNaturalist, GBIF and Wikipedia data.

## Requirements

- Node.js 22 or later
- Docker and Docker Compose

## Run with Docker

Pass your Groq API key directly in the command when starting the services:

```sh
GROQ_API_KEY='your-groq-api-key' docker compose up --build
```

This starts the REST backend on port `3000` and PostgreSQL on port `5432`. PostgreSQL data persists in the `pgvector_data` Docker volume. The backend creates a `passages` table at startup. Set `PORT` or `DATABASE_URL` in `.env` to override defaults.

To run the backend directly with Node.js instead, set the key on the command:

```sh
GROQ_API_KEY='your-groq-api-key' npm run dev
```

To run only the database container, use `docker compose up -d pgvector`.

## REST API

```sh
curl http://localhost:3000/api/v1/health
```

Returns service status, version, timestamp, and database connectivity.

### BM25 passage search

`POST /api/v1/passages/search/bm25` extracts keywords with Groq, searches the indexed `common_name`, `scientific_name`, `class`, `family`, and `text` fields with ParadeDB BM25, and returns the top 20 passages with their scores.

```bash
curl -X POST http://localhost:3000/api/v1/passages/search/bm25 \
  -H 'Content-Type: application/json' \
  -d '{"query":"Which Texas reptiles live near water?"}'
```

The response includes the extracted keywords and ranked passage records. Search uses disjunctive matching: a passage can match any keyword in any indexed text field, and BM25 orders the matches by relevance. The database container uses the ParadeDB PostgreSQL 17 image and creates its BM25 index during backend initialization.

### Semantic passage search

`POST /api/v1/passages/search/embedding` accepts a natural-language query, retrieves the top 20 matching passages by embedding similarity, then asks Groq to re-rank them and generate a natural-language answer grounded in those passages. The response contains only the generated answer:

```bash
curl -X POST http://localhost:3000/api/v1/passages/search/embedding \
  -H 'Content-Type: application/json' \
  -d '{"query":"Which Texas reptiles live near water?"}'
```

```json
{"answer":"..."}
```

Set `GROQ_API_KEY` before starting the backend. The default model is `openai/gpt-oss-20b`; set `GROQ_MODEL` to override it. Without a key, this endpoint returns HTTP 503.

The `passages` table stores `passage_id`, `taxon_id`, `scientific_name`, `common_name`, `class`, `family`, `observation_count`, `passage_index`, `source`, and `text`. The `passage_embeddings` table stores vectors with their model ID and dimension, so results from different models can be compared side by side. The CSV is committed, so you only need `npm run collect` to refresh the data. It queries the iNaturalist, GBIF and Wikipedia APIs (rate-limited, so a cold run takes a long time), caches responses in `scripts/data/raw/` and writes `scripts/data/passages.csv`. Import only happens while the table is empty, so after regenerating the CSV, reset the database volume (`docker compose down -v`) to load it. When the backend starts and the table is empty, it imports this CSV and computes MiniLM embeddings locally with Transformers.js. The model is downloaded on first use and cached.

Embedding model adapters are registered in `src/services/embeddings.js`. At every backend startup, the service fills any missing vectors for every registered model and leaves existing embeddings intact. Add a model adapter there to have its vectors generated automatically on the next startup.
