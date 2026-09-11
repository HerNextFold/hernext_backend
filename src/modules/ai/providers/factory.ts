import { GeminiProvider } from './gemini.provider.js';
import { type LLMProvider, UnconfiguredProvider } from './llm.provider.js';
import { OpenAiCompatibleProvider } from './openai-compatible.provider.js';

export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export interface LlmProviderConfig {
  provider: string;
  apiKey: string | undefined;
  model: string | undefined;
}

/**
 * Selects a concrete LLM provider implementation from configuration. If no API
 * key or model is configured we return UnconfiguredProvider, which fails safely
 * instead of performing a real (or mocked) call - so the backend never silently
 * falls back to a fake provider in production.
 *
 * Groq exposes an OpenAI-compatible Chat Completions API, so it reuses
 * OpenAiCompatibleProvider with Groq's base URL (docs/AI_SPEC.md §16, §43).
 */
export function buildLlmProvider(input: LlmProviderConfig): LLMProvider {
  if (!input.apiKey || !input.model) {
    return new UnconfiguredProvider();
  }
  switch (input.provider.toLowerCase()) {
    case 'groq':
      return new OpenAiCompatibleProvider({
        apiKey: input.apiKey,
        model: input.model,
        baseUrl: GROQ_BASE_URL,
      });
    case 'openai':
    case 'openai-compatible':
      return new OpenAiCompatibleProvider({
        apiKey: input.apiKey,
        model: input.model,
        baseUrl: OPENAI_BASE_URL,
      });
    case 'gemini':
      return new GeminiProvider({ apiKey: input.apiKey, model: input.model });
    default:
      return new OpenAiCompatibleProvider({
        apiKey: input.apiKey,
        model: input.model,
        baseUrl: OPENAI_BASE_URL,
      });
  }
}