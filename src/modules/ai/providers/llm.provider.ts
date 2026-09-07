/**
 * LLM Provider abstraction (docs/AI_SPEC.md §16, docs/DEVELOPMENT_PLAN.md §16).
 *
 * The rest of the AI module depends on this interface, never on a specific SDK,
 * so the provider can be swapped later (e.g. OpenAI → Anthropic → local model).
 */

/** A provider that returns structured JSON from a system prompt and user input. */
export interface LLMProvider {
  /** Generates a structured JSON object. Throws LLMProviderError on failure. */
  completeStructured(input: {
    system: string;
    user: string;
  }): Promise<unknown>;
}

/** Classifies provider failures so the AI service can retry transient ones. */
export type ProviderFailureKind = 'timeout' | 'unavailable' | 'rate_limit' | 'invalid';

export class LLMProviderError extends Error {
  readonly kind: ProviderFailureKind;
  readonly retryable: boolean;

  constructor(message: string, kind: ProviderFailureKind, retryable: boolean) {
    super(message);
    this.name = 'LLMProviderError';
    this.kind = kind;
    this.retryable = retryable;
  }
}

/**
 * A no-op provider used when no AI_API_KEY is configured. It never performs a
 * network call - instead it throws so AI endpoints fail safely without a mock.
 */
export class UnconfiguredProvider implements LLMProvider {
  async completeStructured(): Promise<unknown> {
    throw new LLMProviderError(
      'AI provider is not configured.',
      'unavailable',
      false,
    );
  }
}
