import type { EmailProvider, OutboundEmail } from './email-provider.js';

/** Raised by email providers. The message never contains OTPs or secrets. */
export class EmailProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmailProviderError';
  }
}

export interface BrevoEmailProviderOptions {
  apiKey: string;
  senderEmail: string;
  senderName?: string;
  apiUrl?: string;
  timeoutMs?: number;
}

/**
 * Brevo (Sendinblue) transactional email provider implemented with the
 * built-in fetch API - no extra SDK dependency (docs/SECURITY_SPEC.md §48).
 *
 * Security:
 * - The API key travels only in the `api-key` header, never in URLs, bodies,
 *   responses, or logs.
 * - OTPs are passed by the caller and are never stored on the instance.
 * - Failures are normalised into EmailProviderError so provider internals and
 *   API keys never leak to the client (docs/AGENTS.md §14).
 */
export class BrevoEmailProvider implements EmailProvider {
  readonly name = 'brevo';

  private readonly apiKey: string;
  private readonly senderEmail: string;
  private readonly senderName: string;
  private readonly apiUrl: string;
  private readonly timeoutMs: number;

  constructor(input: BrevoEmailProviderOptions) {
    this.apiKey = input.apiKey;
    this.senderEmail = input.senderEmail;
    this.senderName = input.senderName ?? 'HerNext';
    this.apiUrl = input.apiUrl ?? 'https://api.brevo.com/v3/smtp/email';
    this.timeoutMs = input.timeoutMs ?? 10_000;
  }

  async send(input: OutboundEmail): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          accept: 'application/json',
          'api-key': this.apiKey,
        },
        body: JSON.stringify({
          sender: { email: this.senderEmail, name: this.senderName },
          to: [{ email: input.to }],
          subject: this.subjectFor(input.purpose),
          htmlContent: `<p>${this.escapeHtml(input.body)}</p>`,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new EmailProviderError(
          response.status === 429
            ? 'Email rate limit exceeded.'
            : response.status === 401 || response.status === 403
              ? 'Email provider authentication failed.'
              : response.status >= 500
                ? 'Email provider error.'
                : 'Email provider request rejected.',
        );
      }
    } catch (error) {
      if (error instanceof EmailProviderError) {
        throw error;
      }
      if ((error as Error).name === 'AbortError') {
        throw new EmailProviderError('Email request timed out.');
      }
      throw new EmailProviderError('Email request failed.');
    } finally {
      clearTimeout(timer);
    }
  }

  private subjectFor(purpose: OutboundEmail['purpose']): string {
    return purpose === 'EMAIL_VERIFICATION'
      ? 'HerNext: verify your email'
      : 'HerNext: reset your password';
  }

  private escapeHtml(value: string): string {
    return value
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}