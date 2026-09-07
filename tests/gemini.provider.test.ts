import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiProvider } from '../src/modules/ai/providers/gemini.provider.js';
import { LLMProviderError } from '../src/modules/ai/providers/llm.provider.js';

describe('GeminiProvider', () => {
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
    return new GeminiProvider({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash',
      baseUrl: 'https://mock.test/v1beta',
      timeoutMs: 1000,
    });
  }

  function okResponse(content: string): Response {
    return new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text: content }] } }],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  it('returns the parsed JSON content from the candidate parts', async () => {
    fetchMock.mockResolvedValue(okResponse(JSON.stringify({ automationTasks: ['Data entry'] })));
    const result = await provider().completeStructured({ system: 'x', user: 'y' });
    expect(result).toEqual({ automationTasks: ['Data entry'] });
  });

  it('concatenates multiple candidate parts into one JSON payload', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: '{"automationTasks": [' }, { text: '"A", "B"]}' }] } },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    const result = await provider().completeStructured({ system: 'x', user: 'y' });
    expect(result).toEqual({ automationTasks: ['A', 'B'] });
  });

  it('sends the system prompt as systemInstruction, the user prompt, and requests JSON', async () => {
    fetchMock.mockResolvedValue(okResponse('{}'));
    await provider().completeStructured({ system: 'sys', user: 'usr' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://mock.test/v1beta/models/gemini-2.0-flash:generateContent');
    const body = JSON.parse(String(init.body));
    expect(body.systemInstruction.parts[0].text).toBe('sys');
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'usr' }] }]);
    expect(body.generationConfig.responseMimeType).toBe('application/json');
  });

  it('sends the API key in the x-goog-api-key header, never in the URL', async () => {
    fetchMock.mockResolvedValue(okResponse('{}'));
    await provider().completeStructured({ system: 'x', user: 'y' });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).not.toContain('test-key');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('test-key');
  });

  it('classifies an empty content as invalid (non-retryable)', async () => {
    fetchMock.mockResolvedValue(okResponse('   '));
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toMatchObject({
      kind: 'invalid',
      retryable: false,
    });
  });

  it('classifies malformed JSON content as invalid (non-retryable)', async () => {
    fetchMock.mockResolvedValue(okResponse('{definitely not json'));
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toMatchObject({
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

  it('classifies an auth failure (401/403) as unavailable and non-retryable', async () => {
    fetchMock.mockResolvedValue(new Response('unauthorized', { status: 403 }));
    await expect(provider().completeStructured({ system: 'x', user: 'y' })).rejects.toMatchObject({
      kind: 'unavailable',
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
