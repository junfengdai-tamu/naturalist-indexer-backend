# Naturalist Indexer Backend

Node.js REST service backed by the official iNaturalist API.

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

Returns service status, version, and timestamp.

## Docker

```sh
docker build -t naturalist-indexer-backend .
docker run --rm -p 3000:3000 naturalist-indexer-backend
```

Then open `http://localhost:3000/api/v1/health`.
