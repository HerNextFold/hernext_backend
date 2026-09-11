import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAiCompatibleProvider } from '../src/modules/ai/providers/openai-compatible.provider.js';
import { LLMProviderError } from '../src/modules/ai/providers/llm.provider.js';

describe('OpenAiCompatibleProvider', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function provider() {
    return new OpenAiCompatibleProvider({
      apiKey: 'test-key',
      model: 'test-model',
      baseUrl: 'https://mock.test/v1',
      timeoutMs: 1000,
    });
  }

  function okResponse(content: string): Response {
    return new Response(
      JSON.stringify({ choices: [{ message: { content } }] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  it('returns the parsed JSON content from the assistant message', async () => {
    fetchMock.mockResolvedValue(okResponse(JSON.stringify({ automationTasks: ['Data entry'] })));
    const result = await provider().completeStructured({ system: 'x', user: 'y' });
    expect(result).toEqual({ automationTasks: ['Data entry'] });
  });

  it('sends the system prompt, user prompt and JSON response format', async () => {
    fetchMock.mockResolvedValue(okResponse('{}'));
    await provider().completeStructured({ system: 'sys', user: 'usr' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://mock.test/v1/chat/completions');
    const body = JSON.parse(String(init.body));
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'usr' },
    ]);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.max_completion_tokens).toBe(2000);
  });

  it('sends the API key in the Authorization header, never in the URL or error text', async () => {
    fetchMock.mockResolvedValue(new Response('payload', { status: 401 }));
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toMatchObject({
      kind: 'unavailable',
      retryable: false,
    });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('test-key');
    expect(String(url)).not.toMatch(/[Bb]earer/);
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer test-key');
    expect(headers.Authorization).not.toContain('\n');
  });

  it('classifies an empty content as invalid (non-retryable)', async () => {
    fetchMock.mockResolvedValue(okResponse('   '));
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toMatchObject({
      name: 'LLMProviderError',
      kind: 'invalid',
      retryable: false,
    });
  });

  it('classifies malformed JSON content as invalid (non-retryable)', async () => {
    fetchMock.mockResolvedValue(okResponse('{definitely not json'));
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toMatchObject({
      name: 'LLMProviderError',
      kind: 'invalid',
      retryable: false,
    });
  });

  it('classifies a 429 as rate_limit and retryable', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }));
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toMatchObject({
      kind: 'rate_limit',
      retryable: true,
    });
  });

  it('classifies a 5xx as unavailable and retryable', async () => {
    fetchMock.mockResolvedValue(new Response('boom', { status: 503 }));
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toMatchObject({
      kind: 'unavailable',
      retryable: true,
    });
  });

  it('classifies a 400 as invalid and non-retryable', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }));
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toMatchObject({
      kind: 'invalid',
      retryable: false,
    });
  });

  it('classifies a timeout as timeout and retryable', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toMatchObject({
      kind: 'timeout',
      retryable: true,
    });
  });

  it('classifies a network failure as unavailable and retryable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toMatchObject({
      kind: 'unavailable',
      retryable: true,
    });
  });

  it('re-wraps its own provider errors unchanged', async () => {
    const original = new LLMProviderError('boom', 'unavailable', true);
    fetchMock.mockRejectedValue(original);
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toBe(original);
  });
});