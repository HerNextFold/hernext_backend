import { afterAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, initDb } from '../src/lib/db.js';

// Real Neon connectivity checks run only when explicitly requested via
// RUN_DB_TESTS=1 so the default test suite stays offline and deterministic.
const runDbTests = process.env.RUN_DB_TESTS === '1';

describe.runIf(runDbTests)('database connectivity', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('initialises the pool and reaches the database', async () => {
    const config = loadEnv();
    initDb(config);
    expect(await checkDatabaseConnection()).toBe(true);
  });
});