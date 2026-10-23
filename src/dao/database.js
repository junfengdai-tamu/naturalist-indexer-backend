import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { getEmbeddingModel, listEmbeddingModels } from '../services/embeddings.js';

const { Pool } = pg;
const PASSAGES_CSV = fileURLToPath(new URL('../../scripts/data/passages.csv', import.meta.url));
const EXPECTED_HEADERS = [
  'passage_id', 'taxon_id', 'scientific_name', 'common_name', 'class', 'family',
  'observation_count', 'passage_index', 'source', 'text',
];

function parseCsv(csv) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && csv[i + 1] === '\n') i += 1;
      record.push(field);
      if (record.some((value) => value !== '')) records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || record.length) {
    record.push(field);
    if (record.some((value) => value !== '')) records.push(record);
  }
  if (quoted) throw new Error(`Unclosed quoted field in ${PASSAGES_CSV}`);

  const [headers, ...rows] = records;
  if (!headers || EXPECTED_HEADERS.some((header, index) => headers[index] !== header)
    || headers.length !== EXPECTED_HEADERS.length) {
    throw new Error(`CSV headers in ${PASSAGES_CSV} must be: ${EXPECTED_HEADERS.join(', ')}`);
  }
  return rows.map((values, index) => {
    if (values.length !== EXPECTED_HEADERS.length) {
      throw new Error(`CSV row ${index + 2} has ${values.length} fields; expected ${EXPECTED_HEADERS.length}`);
    }
    return Object.fromEntries(EXPECTED_HEADERS.map((header, fieldIndex) => [header, values[fieldIndex]]));
  });
}

async function importPassages(client) {
  let csv;
  try {
    csv = await readFile(PASSAGES_CSV, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Database passages table is empty and CSV was not found at ${PASSAGES_CSV}. Run scripts/collect-species.js first.`);
    }
    throw error;
  }

  const rows = parseCsv(csv);
  if (rows.length === 0) throw new Error(`No passage records found in ${PASSAGES_CSV}`);

  const model = await getEmbeddingModel('minilm');
  console.log(`Generating ${model.id} embeddings for ${rows.length} passages...`);
  const batchSize = 32;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const embeddings = await model.embed(batch.map((row) => row.text));

    for (let index = 0; index < batch.length; index += 1) {
      const row = batch[index];
      const embedding = embeddings[index];
      const vector = `[${embedding.join(',')}]`;
      await client.query(`
        INSERT INTO passages (
          passage_id, taxon_id, scientific_name, common_name, class, family,
          observation_count, passage_index, source, text
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `, [
        row.passage_id, Number(row.taxon_id), row.scientific_name, row.common_name || null,
        row.class || null, row.family || null, Number(row.observation_count),
        Number(row.passage_index), row.source || null, row.text,
      ]);
      await client.query(`
        INSERT INTO passage_embeddings (passage_id, model_id, dimensions, embedding)
        VALUES ($1, $2, $3, $4::vector)
      `, [row.passage_id, model.id, model.dimensions, vector]);
    }
    console.log(`Embedded ${Math.min(start + batch.length, rows.length)}/${rows.length} passages with ${model.id}`);
  }
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/naturalist',
});

export async function initializeDatabase() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS passages (
      passage_id TEXT PRIMARY KEY,
      taxon_id BIGINT NOT NULL,
      scientific_name TEXT NOT NULL,
      common_name TEXT,
      class TEXT,
      family TEXT,
      observation_count INTEGER NOT NULL DEFAULT 0,
      passage_index INTEGER NOT NULL,
      source TEXT,
      text TEXT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS passage_embeddings (
      passage_id TEXT NOT NULL REFERENCES passages(passage_id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      dimensions INTEGER NOT NULL,
      embedding VECTOR NOT NULL,
      PRIMARY KEY (passage_id, model_id)
    )
  `);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT pg_advisory_xact_lock(hashtext('passages_bootstrap'))");
    const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM passages');
    if (rows[0].count === 0) await importPassages(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  for (const { key } of listEmbeddingModels()) {
    await generateMissingPassageEmbeddings(key);
  }
}

export async function generateMissingPassageEmbeddings(modelKey, batchSize = 32) {
  const metadata = listEmbeddingModels().find(({ key }) => key === modelKey);
  if (!metadata) {
    throw new Error(`Unknown embedding model "${modelKey}". Available models: ${listEmbeddingModels().map(({ key }) => key).join(', ')}`);
  }
  const { rows: pending } = await pool.query(`
    SELECT 1
    FROM passages AS p
    LEFT JOIN passage_embeddings AS e
      ON e.passage_id = p.passage_id AND e.model_id = $1
    WHERE e.passage_id IS NULL
    LIMIT 1
  `, [metadata.id]);
  if (pending.length === 0) return 0;

  const model = await getEmbeddingModel(modelKey);
  let embedded = 0;

  while (true) {
    const { rows } = await pool.query(`
      SELECT p.passage_id, p.text
      FROM passages AS p
      LEFT JOIN passage_embeddings AS e
        ON e.passage_id = p.passage_id AND e.model_id = $1
      WHERE e.passage_id IS NULL
      ORDER BY p.passage_id
      LIMIT $2
    `, [model.id, batchSize]);
    if (rows.length === 0) return embedded;

    const vectors = await model.embed(rows.map((row) => row.text));
    for (let index = 0; index < rows.length; index += 1) {
      await pool.query(`
        INSERT INTO passage_embeddings (passage_id, model_id, dimensions, embedding)
        VALUES ($1, $2, $3, $4::vector)
        ON CONFLICT (passage_id, model_id) DO NOTHING
      `, [rows[index].passage_id, model.id, model.dimensions, `[${vectors[index].join(',')}]`]);
    }
    embedded += rows.length;
    console.log(`Generated ${embedded} ${model.id} embeddings`);
  }
}
