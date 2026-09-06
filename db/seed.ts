import { loadEnv } from '../src/config/env.js';

async function main(): Promise<void> {
  const config = loadEnv();
  void config;

  // Phase 2: seed career catalogue, skill catalogue, demo data and challenges
  // only after the schema migration exists.
  console.log('Seeding is not implemented yet (Phase 2).');
}

main().catch((error: unknown) => {
  console.error('Seeding failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});