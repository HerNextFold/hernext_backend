import { loadEnv } from '../src/config/env.js';
import { checkDatabaseConnection, closeDb, initDb } from '../src/lib/db.js';

async function main(): Promise<void> {
  const config = loadEnv();
  initDb(config);
  const connected = await checkDatabaseConnection();
  console.log(connected ? 'Database connection OK' : 'Database connection FAILED');
  await closeDb();
  process.exitCode = connected ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error('Connection check failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});