import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PoolClient } from 'pg';
import { loadEnv } from '../src/config/env.js';
import { closeDb, initDb, queryText, withTransaction } from '../src/lib/db.js';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const dryRun = process.argv.includes('--dry');

function printHelp(): void {
  console.log('Usage: npm run db:migrate [-- --dry]');
  console.log('  Applies pending SQL migrations from db/migrations in order.');
  console.log('  --dry  Lists migrations that would be applied without applying them.');
}

async function appliedFilenames(client: PoolClient): Promise<Set<string>> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const rows = await queryText<{ filename: string }>(client, 'SELECT filename FROM schema_migrations');
  return new Set(rows.map((row) => row.filename));
}

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    printHelp();
    return;
  }

  const config = loadEnv();
  initDb(config);

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort();

  if (dryRun) {
    console.log(`Dry run: ${files.length} migration(s) found in db/migrations`);
    for (const file of files) {
      console.log(`  - ${file}`);
    }
    await closeDb();
    return;
  }

  await withTransaction(async (client) => {
    const applied = await appliedFilenames(client);
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`Skipped ${file} (already applied)`);
        continue;
      }
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      console.log(`Applied ${file}`);
    }
  });

  await closeDb();
  console.log('Migrations complete.');
}

main().catch((error: unknown) => {
  console.error('Migration failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});