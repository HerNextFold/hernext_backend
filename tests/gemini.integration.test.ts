import { describe, expect, it } from 'vitest';
import { GeminiProvider } from '../src/modules/ai/providers/gemini.provider.js';

/**
 * Optional manual/integration test for the REAL Google Gemini provider.
 *
 * This test intentionally does NOT run in the normal suite. It only executes
 * when BOTH of the following are true, so it can never accidentally hit a live
 * provider or leak a key during routine development:
 *
 *   - RUN_GEMINI=1            (explicit opt-in)
 *   - AI_PROVIDER=gemini AND AI_API_KEY AND AI_MODEL are set
 *
 * The API key is read from the environment at runtime; it is never committed,
 * logged, or printed by this test.
 *
 * Run manually with:
 *   set RUN_GEMINI=1&& npx vitest run tests/gemini.integration.test.ts
 */
const runGemini = process.env.RUN_GEMINI === '1';
const apiKey = process.env.AI_API_KEY ?? '';
const model = process.env.AI_MODEL ?? '';
const providerMatches = (process.env.AI_PROVIDER ?? 'gemini').toLowerCase() === 'gemini';
const enabled = runGemini && providerMatches && apiKey.length > 0 && model.length > 0;

describe('GeminiProvider (live, opt-in)', () => {
  it.skipIf(!enabled)('returns structured JSON using the configured model', async () => {
    if (!enabled) {
      // The skip above already handles the not-enabled path; this guard only
      // exists to satisfy the type checker when the key is unknown at runtime.
      return;
    }
    const provider = new GeminiProvider({ apiKey, model });
    const result = (await provider.completeStructured({
      system: 'Return only valid JSON. Do not add commentary.',
      user: 'Return the JSON object {"answer": 42}.',
    })) as { answer?: number };
    expect(result.answer).toBe(42);
  }, 60_000);
});
