import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/naturalist',
});

export async function initializeDatabase() {
  await pool.query('CREATE EXTENSION IF NOT EXISTS vector');
  await pool.query(`
    CREATE TABLE IF NOT EXISTS observations (
      observation_id BIGINT PRIMARY KEY,
      species TEXT,
      common_name TEXT,
      observed_on DATE,
      place TEXT,
      uri TEXT NOT NULL,
      content TEXT,
      embedding VECTOR,
      source_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      embedded_at TIMESTAMPTZ
    )
  `);
}
