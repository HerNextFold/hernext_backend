import type { EmailProvider, OutboundEmail } from './email-provider.js';

/**
 * In-memory email provider for tests, development and QA. Captures outgoing
 * messages so tests and demo tooling can read them directly from the provider
 * instance without exposing OTPs through any HTTP or log surface.
 */
export class TestEmailProvider implements EmailProvider {
  readonly name = 'test';

  private readonly messages: OutboundEmail[] = [];

  send(input: OutboundEmail): Promise<void> {
    this.messages.push(input);
    return Promise.resolve();
  }

  /** All captured messages for a destination address. */
  messagesFor(email: string): OutboundEmail[] {
    return this.messages.filter((message) => message.to.toLowerCase() === email.toLowerCase());
  }

  /** Newest captured message for a destination address and purpose, if any. */
  latestFor(email: string, purpose: OutboundEmail['purpose']): OutboundEmail | undefined {
    const matches = this.messagesFor(email).filter((message) => message.purpose === purpose);
    return matches[matches.length - 1];
  }

  clear(): void {
    this.messages.length = 0;
  }
}