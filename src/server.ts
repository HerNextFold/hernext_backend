import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';
import { closeDb, initDb } from './lib/db.js';

const config = loadEnv();
initDb(config);

const app = buildApp({ config });

// Close the connection pool when the server shuts down.
app.addHook('onClose', async () => {
  await closeDb();
});

const host = config.nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1';

async function start(): Promise<void> {
  try {
    await app.listen({ port: config.port, host });
    app.log.info(`HerNext API listening on http://${host}:${config.port}${config.nodeEnv === 'production' ? '' : ' /docs'}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void app.close().then(() => process.exit(0));
  });
}

void start();