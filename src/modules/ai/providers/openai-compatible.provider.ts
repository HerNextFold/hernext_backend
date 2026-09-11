import {
  LLMProviderError,
  type LLMProvider,
} from './llm.provider.js';

/**
 * OpenAI-compatible chat-completions provider implemented with the built-in
 * fetch API (no extra SDK dependency). Responses are expected to contain a JSON
 * object in the first assistant message's `content`.
 *
 * Retries are handled by the AI service per the documented strategy
 * (docs/AI_SPEC.md §32): max 1–2 retries, only for transient failures.
 */
export class OpenAiCompatibleProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;

  constructor(input: {
    apiKey: string;
    model: string;
    baseUrl?: string;
    timeoutMs?: number;
    maxTokens?: number;
  }) {
    this.apiKey = input.apiKey;
    this.model = input.model;
    this.baseUrl = input.baseUrl ?? 'https://api.openai.com/v1';
    this.timeoutMs = input.timeoutMs ?? 30_000;
    // Bounds the generated response (docs/AI_SPEC.md §23). The Zod output
    // schemas remain the final safety boundary; this only caps token spend so
    // a runaway completion cannot inflate cost or latency. The field is named
    // max_completion_tokens because max_tokens is deprecated on modern
    // OpenAI-compatible APIs (Groq's GPT-OSS models and OpenAI both honour the
    // newer name).
    this.maxTokens = input.maxTokens ?? 2000;
  }

  async completeStructured(input: { system: string; user: string }): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          max_completion_tokens: this.maxTokens,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw this.httpError(response.status);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || content.trim().length === 0) {
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
    if (status === 429) {
      return new LLMProviderError('LLM rate limit exceeded.', 'rate_limit', true);
    }
    if (status === 401 || status === 403) {
      return new LLMProviderError('LLM authentication failed.', 'unavailable', false);
    }
    if (status >= 500) {
      return new LLMProviderError('LLM provider error.', 'unavailable', true);
    }
    return new LLMProviderError('LLM provider request rejected.', 'invalid', false);
  }
}
