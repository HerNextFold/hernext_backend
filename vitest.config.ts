import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';

/**
 * The codebase targets NodeNext ESM, so relative imports carry a `.js` suffix
 * (e.g. `./config/env.js`). tsx understands this natively, but Vite/Vitest
 * needs a small resolver to map those specifiers onto the `.ts` sources.
 */
function resolveJsToTs(): Plugin {
  return {
    name: 'resolve-js-to-ts',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (importer === undefined) {
        return null;
      }
      if (!source.startsWith('.') && !source.startsWith('/')) {
        return null;
      }
      if (!source.endsWith('.js')) {
        return null;
      }
      const withTs = source.slice(0, -3) + '.ts';
      const resolved = await this.resolve(withTs, importer, { skipSelf: true });
      return resolved ?? null;
    },
  };
}

export default defineConfig({
  plugins: [resolveJsToTs()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globals: false,
    setupFiles: ['./tests/vitest.setup.ts'],
    // Deterministic, resource-light execution for the hackathon VM. First
    // requests can be slow while dependencies compile, so give tests headroom.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});