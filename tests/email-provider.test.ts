import { afterAll, describe, expect, it, vi } from 'vitest';
import {
  BrevoEmailProvider,
  EmailProviderError,
  TestEmailProvider,
  buildEmailProvider,
  renderOtpEmail,
} from '../src/modules/auth/email/index.js';
import type { OutboundEmail } from '../src/modules/auth/email/index.js';

describe('TestEmailProvider', () => {
  it('captures outgoing messages for later inspection without HTTP or logs', async () => {
    const provider = new TestEmailProvider();
    expect(provider.name).toBe('test');
    const message: OutboundEmail = { to: 'aisha@example.com', purpose: 'EMAIL_VERIFICATION', body: 'Your code is 123456.' };
    await provider.send(message);
    expect(provider.messagesFor('AISHA@EXAMPLE.COM')).toHaveLength(1);
    expect(provider.latestFor('aisha@example.com', 'EMAIL_VERIFICATION')).toBe(message);
    expect(provider.latestFor('aisha@example.com', 'PASSWORD_RESET')).toBeUndefined();
  });

  it('returns the newest message for a destination and purpose', async () => {
    const provider = new TestEmailProvider();
    await provider.send({ to: 'a@example.com', purpose: 'EMAIL_VERIFICATION', body: 'first' });
    await provider.send({ to: 'a@example.com', purpose: 'EMAIL_VERIFICATION', body: 'second' });
    await provider.send({ to: 'a@example.com', purpose: 'PASSWORD_RESET', body: 'reset' });
    expect(provider.latestFor('a@example.com', 'EMAIL_VERIFICATION')?.body).toBe('second');
  });

  it('clears captured messages', async () => {
    const provider = new TestEmailProvider();
    await provider.send({ to: 'a@example.com', purpose: 'EMAIL_VERIFICATION', body: 'x' });
    provider.clear();
    expect(provider.messagesFor('a@example.com')).toHaveLength(0);
  });
});

describe('renderOtpEmail', () => {
  it('embeds the code and expiry label for both purposes', () => {
    const verify = renderOtpEmail('EMAIL_VERIFICATION', '654321');
    expect(verify).toContain('654321');
    expect(verify).toContain('verify your email');
    expect(verify).toContain('10 minutes');

    const reset = renderOtpEmail('PASSWORD_RESET', '112233');
    expect(reset).toContain('112233');
    expect(reset).toContain('reset your password');
  });
});

describe('buildEmailProvider', () => {
  it('returns the in-memory provider by default', () => {
    const provider = buildEmailProvider({
      emailProvider: 'test',
      brevoApiKey: undefined,
      brevoSenderEmail: undefined,
      brevoSenderName: undefined,
    });
    expect(provider).toBeInstanceOf(TestEmailProvider);
  });

  it('builds a Brevo provider from config', () => {
    const provider = buildEmailProvider({
      emailProvider: 'brevo',
      brevoApiKey: 'key-123',
      brevoSenderEmail: 'no-reply@hernext.africa',
      brevoSenderName: 'HerNext',
    });
    expect(provider).toBeInstanceOf(BrevoEmailProvider);
  });

  it('throws when Brevo is requested without credentials', () => {
    expect(() =>
      buildEmailProvider({
        emailProvider: 'brevo',
        brevoApiKey: undefined,
        brevoSenderEmail: undefined,
        brevoSenderName: undefined,
      }),
    ).toThrow(/BREVO_API_KEY and BREVO_SENDER_EMAIL/);
  });
});

describe('BrevoEmailProvider', () => {
  const originalFetch = global.fetch;

  afterAll(() => {
    global.fetch = originalFetch;
  });

  function provider(overrides: { apiUrl?: string; timeoutMs?: number } = {}): BrevoEmailProvider {
    return new BrevoEmailProvider({
      apiKey: 'super-secret-key',
      senderEmail: 'no-reply@hernext.africa',
      senderName: 'HerNext',
      apiUrl: overrides.apiUrl ?? 'https://api.brevo.com/v3/smtp/email',
      timeoutMs: overrides.timeoutMs ?? 10_000,
    });
  }

  it('posts a transactional email with the API key only in the header', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await provider().send({ to: 'aisha@example.com', purpose: 'EMAIL_VERIFICATION', body: 'Your code is 123456.' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.brevo.com/v3/smtp/email');

    const headers = init.headers as Record<string, string>;
    expect(headers['api-key']).toBe('super-secret-key');

    const body = JSON.parse(init.body as string) as {
      sender: { email: string; name: string };
      to: Array<{ email: string }>;
      subject: string;
      htmlContent: string;
    };
    expect(body.sender).toEqual({ email: 'no-reply@hernext.africa', name: 'HerNext' });
    expect(body.to).toEqual([{ email: 'aisha@example.com' }]);
    expect(body.subject).toContain('verify your email');
    expect(body.htmlContent).toContain('Your code is 123456.');
    expect(JSON.stringify(init.body)).not.toContain('super-secret-key');
  });

  it.each([
    [429, 'Email rate limit exceeded.'],
    [401, 'Email provider authentication failed.'],
    [403, 'Email provider authentication failed.'],
    [500, 'Email provider error.'],
    [422, 'Email provider request rejected.'],
  ])('normalises HTTP %i into a safe %s', async (status, expected) => {
    global.fetch = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    let message = '';
    try {
      await provider().send({ to: 'a@example.com', purpose: 'PASSWORD_RESET', body: 'Your code is 123456.' });
    } catch (error) {
      expect(error).toBeInstanceOf(EmailProviderError);
      message = (error as Error).message;
    }
    expect(message).toBe(expected);
  });

  it('normalises a network failure into a safe error', async () => {
    global.fetch = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('network down'));
    await expect(
      provider().send({ to: 'a@example.com', purpose: 'EMAIL_VERIFICATION', body: 'Your code is 123456.' }),
    ).rejects.toThrow('Email request failed.');
  });

  it('normalises a timeout into a safe error', async () => {
    const abortError = Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
    global.fetch = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          (init?.signal as AbortSignal).addEventListener('abort', () => reject(abortError));
        }),
    ) as unknown as typeof fetch;

    try {
      await provider({ timeoutMs: 5 }).send({
        to: 'a@example.com',
        purpose: 'EMAIL_VERIFICATION',
        body: 'Your code is 123456.',
      });
    } catch (error) {
      expect(error).toBeInstanceOf(EmailProviderError);
      expect((error as Error).message).toBe('Email request timed out.');
      return;
    }
    throw new Error('Expected a timeout error.');
  });
});