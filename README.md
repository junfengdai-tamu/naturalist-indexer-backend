# Naturalist Indexer Backend

Node.js REST service for semantic search over Texas reptile and amphibian passages, built from iNaturalist, GBIF and Wikipedia data.

## Requirements

- Node.js 22 or later
- Docker and Docker Compose

## Run with Docker

Pass your TAMU AI API key directly in the command when starting the services:

```sh
TAMU_API_KEY='your-tamu-api-key' docker compose up --build
```

This starts the REST backend on port `3000` and PostgreSQL on port `5432`. PostgreSQL data persists in the `pgvector_data` Docker volume. The backend creates a `passages` table at startup. Set `PORT` or `DATABASE_URL` in `.env` to override defaults.

To run the backend directly with Node.js instead, set the key on the command:

```sh
TAMU_API_KEY='your-tamu-api-key' npm run dev
```

To run only the database container, use `docker compose up -d pgvector`.

## REST API

```sh
curl http://localhost:3000/api/v1/health
```

Returns service status, version, timestamp, and database connectivity.

### Passage search

Two retrievers share one request and response contract, so their results can be compared directly:

| Endpoint | Retrieval | Score |
|---|---|---|
| `POST /api/v1/passages/search/bm25` | TAMU AI extracts keywords from the query, then ParadeDB BM25 searches `common_name`, `scientific_name`, `class`, `family` and `text` (any keyword may match any field) | `bm25` |
| `POST /api/v1/passages/search/embedding` | MiniLM embeds the query, then pgvector ranks passages by cosine similarity | `cosine_similarity` |

Both retrieve the top 20 passages. The body is `{"query": "...", "generate": true}`; `generate` is optional and defaults to `true`.

```bash
curl -X POST http://localhost:3000/api/v1/passages/search/embedding \
  -H 'Content-Type: application/json' \
  -d '{"query":"Which Texas reptiles live near water?"}'
```

```json
{
  "query": "...",
  "retriever": "embedding",
  "score_type": "cosine_similarity",
  "model": "sentence-transformers/all-MiniLM-L6-v2",
  "answer": "...",
  "sources": [{"passage_id": "...", "scientific_name": "...", "text": "...", "score": 0.71, "retrieval_rank": 3}]
}
```

BM25 responses have `"retriever": "bm25"` and a `keywords` array instead of `model`.

- **`generate: true`** sends the 20 retrieved passages to TAMU AI with the same prompt for both retrievers. TAMU AI re-ranks them and writes an answer grounded in them. `sources` follows the re-ranked order, and each source keeps its `retrieval_rank` (its position before re-ranking) and its retriever `score`.
- **`generate: false`** skips the answer and re-rank. `answer` is `null` and `sources` stays in raw retrieval order. This compares the retrievers on their own. The embedding endpoint then needs no TAMU AI call at all; the BM25 endpoint still uses TAMU AI for keyword extraction.
- The prompt contains only passage text and rank, never scores, so BM25 and cosine scores do not influence the generated answer. `answer` is also `null` when nothing matched.

Set `TAMU_API_KEY` and `CF_COOKIE` (the Cloudflare Access cookie) before starting the backend. The model is `protected.Claude Sonnet 4.5` served from `https://chat.tamu.ai/api`. Without a key, requests that need TAMU AI return HTTP 503. If TAMU AI rate-limits the request (HTTP 429 upstream), the backend retries briefly and otherwise returns HTTP 429 with a `Retry-After` header; other TAMU AI failures return HTTP 502. The database container uses the ParadeDB PostgreSQL 17 image and creates its BM25 index during backend initialization.

The `passages` table stores `passage_id`, `taxon_id`, `scientific_name`, `common_name`, `class`, `family`, `observation_count`, `passage_index`, `source`, and `text`. The `passage_embeddings` table stores vectors with their model ID and dimension, so results from different models can be compared side by side. The CSV is committed, so you only need `npm run collect` to refresh the data. It queries the iNaturalist, GBIF and Wikipedia APIs (rate-limited, so a cold run takes a long time), caches responses in `scripts/data/raw/` and writes `scripts/data/passages.csv`. Import only happens while the table is empty, so after regenerating the CSV, reset the database volume (`docker compose down -v`) to load it. When the backend starts and the table is empty, it imports this CSV and computes MiniLM embeddings locally with Transformers.js. The model is downloaded on first use and cached.

Embedding model adapters are registered in `src/services/util/embeddings.js`. At every backend startup, the service fills any missing vectors for every registered model and leaves existing embeddings intact. Add a model adapter there to have its vectors generated automatically on the next startup.
