import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GROQ_BASE_URL,
  OPENAI_BASE_URL,
  buildLlmProvider,
} from '../src/modules/ai/providers/factory.js';
import { GeminiProvider } from '../src/modules/ai/providers/gemini.provider.js';
import { LLMProviderError, UnconfiguredProvider } from '../src/modules/ai/providers/llm.provider.js';
import { OpenAiCompatibleProvider } from '../src/modules/ai/providers/openai-compatible.provider.js';

describe('buildLlmProvider factory', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function groqOk(content: string): Response {
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('returns UnconfiguredProvider when no API key is set', () => {
    const provider = buildLlmProvider({ provider: 'groq', apiKey: undefined, model: 'm' });
    expect(provider).toBeInstanceOf(UnconfiguredProvider);
  });

  it('returns UnconfiguredProvider when no model is set', () => {
    const provider = buildLlmProvider({ provider: 'groq', apiKey: 'k', model: undefined });
    expect(provider).toBeInstanceOf(UnconfiguredProvider);
  });

  it('maps groq to an OpenAI-compatible provider hitting the Groq base URL', async () => {
    const provider = buildLlmProvider({ provider: 'groq', apiKey: 'k', model: 'm' });
    expect(provider).toBeInstanceOf(OpenAiCompatibleProvider);
    fetchMock.mockResolvedValue(groqOk('{}'));
    await provider.completeStructured({ system: 's', user: 'u' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${GROQ_BASE_URL}/chat/completions`);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('m');
    expect(body.temperature).toBe(0);
    expect(body.max_completion_tokens).toBe(2000);
    expect(body.response_format).toEqual({ type: 'json_object' });
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer k');
  });

  it('is case-insensitive when selecting the Groq provider', () => {
    const provider = buildLlmProvider({ provider: 'GROQ', apiKey: 'k', model: 'm' });
    expect(provider).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it('maps openai to an OpenAI-compatible provider hitting the OpenAI base URL', async () => {
    const provider = buildLlmProvider({ provider: 'openai', apiKey: 'k', model: 'm' });
    expect(provider).toBeInstanceOf(OpenAiCompatibleProvider);
    fetchMock.mockResolvedValue(groqOk('{}'));
    await provider.completeStructured({ system: 's', user: 'u' });
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${OPENAI_BASE_URL}/chat/completions`);
  });

  it('maps openai-compatible the same as openai', () => {
    const provider = buildLlmProvider({ provider: 'openai-compatible', apiKey: 'k', model: 'm' });
    expect(provider).toBeInstanceOf(OpenAiCompatibleProvider);
  });

  it('maps gemini to the Gemini provider', () => {
    const provider = buildLlmProvider({ provider: 'gemini', apiKey: 'k', model: 'm' });
    expect(provider).toBeInstanceOf(GeminiProvider);
  });

  it('falls back to the OpenAI-compatible provider for unknown provider names', () => {
    const provider = buildLlmProvider({ provider: 'unknown-vendor', apiKey: 'k', model: 'm' });
    expect(provider).toBeInstanceOf(OpenAiCompatibleProvider);
  });
});

describe('OpenAiCompatibleProvider (Groq wiring)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function groqProvider() {
    return new OpenAiCompatibleProvider({
      apiKey: 'gsk-test-key',
      model: 'openai/gpt-oss-120b',
      baseUrl: GROQ_BASE_URL,
      timeoutMs: 1000,
    });
  }

  function okResponse(content: string): Response {
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('parses structured JSON returned by Groq', async () => {
    fetchMock.mockResolvedValue(okResponse(JSON.stringify({ skillIds: ['sk-detail'] })));
    const result = await groqProvider().completeStructured({ system: 's', user: 'u' });
    expect(result).toEqual({ skillIds: ['sk-detail'] });
  });

  it('classifies a 429 as rate_limit and retryable', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    await expect(groqProvider().completeStructured({ system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'rate_limit',
      retryable: true,
    });
  });

  it('classifies a 401 as unavailable and non-retryable', async () => {
    fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(groqProvider().completeStructured({ system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'unavailable',
      retryable: false,
    });
  });

  it('classifies malformed JSON content as invalid (non-retryable)', async () => {
    fetchMock.mockResolvedValue(okResponse('not json at all'));
    await expect(groqProvider().completeStructured({ system: 's', user: 'u' })).rejects.toMatchObject({
      name: 'LLMProviderError',
      kind: 'invalid',
      retryable: false,
    });
  });

  it('classifies an empty response as invalid (non-retryable)', async () => {
    fetchMock.mockResolvedValue(okResponse('   '));
    await expect(groqProvider().completeStructured({ system: 's', user: 'u' })).rejects.toMatchObject({
      name: 'LLMProviderError',
      kind: 'invalid',
      retryable: false,
    });
  });

  it('never sends the key in the URL and never leaks it via errors', async () => {
    fetchMock.mockResolvedValue(new Response('unauthorized', { status: 401 }));
    await expect(groqProvider().completeStructured({ system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'unavailable',
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('gsk-test-key');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer gsk-test-key');
    expect(headers.Authorization).not.toContain('\n');
  });

  it('re-wraps its own provider errors unchanged', async () => {
    const original = new LLMProviderError('boom', 'unavailable', true);
    fetchMock.mockRejectedValue(original);
    await expect(groqProvider().completeStructured({ system: 's', user: 'u' })).rejects.toBe(original);
  });

  it('classifies a timeout as timeout and retryable', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(groqProvider().completeStructured({ system: 's', user: 'u' })).rejects.toMatchObject({
      kind: 'timeout',
      retryable: true,
    });
  });
});