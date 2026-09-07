import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';
import type { AppConfig } from '../config/env.js';

let pool: Pool | undefined;

function createPool(databaseUrl: string, sslRequired: boolean): Pool {
  const options: PoolConfig = {
    connectionString: databaseUrl,
    max: 10,
    connectionTimeoutMillis: 10000,
    query_timeout: 15000,
    statement_timeout: 15000,
  };

  // Neon requires SSL. If the connection string does not already request a
  // specific sslmode, apply the documented DB_SSL setting.
  if (!databaseUrl.includes('sslmode=')) {
    options.ssl = sslRequired ? { rejectUnauthorized: false } : false;
  }

  return new Pool(options);
}

/**
 * Initialises the shared connection pool exactly once. Must be called during
 * application bootstrap (see src/server.ts) before models run queries.
 */
export function initDb(config: Pick<AppConfig, 'databaseUrl' | 'dbSsl'>): Pool {
  if (pool === undefined) {
    pool = createPool(config.databaseUrl, config.dbSsl);
  }
  return pool;
}

export function getPool(): Pool {
  if (pool === undefined) {
    throw new Error('Database has not been initialised. Call initDb(config) before using queries.');
  }
  return pool;
}

export async function closeDb(): Promise<void> {
  if (pool === undefined) {
    return;
  }
  await pool.end();
  pool = undefined;
}

/** Anything with a `query` method, so models can use either the pool or a transaction client. */
export type Db = Pool | PoolClient;

export async function queryText<T extends QueryResultRow = QueryResultRow>(
  db: Db,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await db.query<T>({ text, values: params });
  return result.rows;
}

export async function queryRow<T extends QueryResultRow = QueryResultRow>(
  db: Db,
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await queryText<T>(db, text, params);
  return rows[0] ?? null;
}

/**
 * Runs `work` inside a BEGIN/COMMIT transaction. Rolls back and rethrows on
 * error. Models accept an optional `Db` argument so their queries participate
 * in the caller-provided transaction client.
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Liveness check for the /health endpoint. Never throws; reports the database
 * as disconnected when the pool is not initialised or the query fails.
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  if (pool === undefined) {
    return false;
  }
  try {
    const row = await queryRow<{ ok: number }>(pool, 'SELECT 1 AS ok');
    return row?.ok === 1;
  } catch {
    return false;
  }
}