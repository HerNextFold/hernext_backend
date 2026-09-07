import {
  LLMProviderError,
  type LLMProvider,
  type ProviderFailureKind,
} from './llm.provider.js';

/**
 * Google Gemini provider (Google AI Studio) implemented with the built-in
 * fetch API - no extra SDK dependency (docs/AI_SPEC.md §16).
 *
 * The caller receives only a structured JSON object; every Gemini response is
 * parsed here and passed up to the AI service, where it is validated with Zod
 * before any persistence (docs/AI_SPEC.md §22).
 *
 * Security:
 * - The API key is sent in the `x-goog-api-key` header, never in the URL, the
 *   response, or logs.
 * - Provider failures are normalised into LLMProviderError with an `invalid`,
 *   `unavailable`, `rate_limit` or `timeout` kind so the backend never leaks
 *   Gemini internals or API keys to the client.
 *
 * Retries are bounded by the AI service (docs/AI_SPEC.md §32): at most one
 * retry for transient failures (timeout, rate_limit, 5xx, network).
 */
export class GeminiProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(input: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    timeoutMs?: number;
  }) {
    this.apiKey = input.apiKey;
    this.model = input.model;
    this.baseUrl = input.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    this.timeoutMs = input.timeoutMs ?? 30_000;
  }

  async completeStructured(input: { system: string; user: string }): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/models/${this.model}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: input.system }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: input.user }],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw this.httpError(response.status);
      }

      const data = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const content = data.candidates?.[0]?.content?.parts
        ?.map((part) => part.text ?? '')
        .join('')
        .trim();
      if (typeof content !== 'string' || content.length === 0) {
        throw new LLMProviderError('LLM returned an empty response.', 'invalid', false);
      }
      try {
        return JSON.parse(content);
      } catch {
        throw new LLMProviderError('LLM returned malformed JSON.', 'invalid', false);
      }
    } catch (error) {
      if (error instanceof LLMProviderError) {
        throw error;
      }
      if ((error as Error).name === 'AbortError') {
        throw new LLMProviderError('LLM request timed out.', 'timeout', true);
      }
      throw new LLMProviderError('LLM request failed.', 'unavailable', true);
    } finally {
      clearTimeout(timer);
    }
  }

  private httpError(status: number): LLMProviderError {
    const kind: ProviderFailureKind =
      status === 429
        ? 'rate_limit'
        : status === 401 || status === 403
          ? 'unavailable'
          : status >= 500
            ? 'unavailable'
            : 'invalid';
    const message =
      status === 429
        ? 'LLM rate limit exceeded.'
        : status === 401 || status === 403
          ? 'LLM authentication failed.'
          : status >= 500
            ? 'LLM provider error.'
            : 'LLM provider request rejected.';
    const retryable = status === 429 || status >= 500;
    return new LLMProviderError(message, kind, retryable);
  }
}
