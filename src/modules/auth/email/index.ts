import type { AppConfig } from '../../../config/env.js';
import { BrevoEmailProvider } from './brevo-email.provider.js';
import type { EmailProvider } from './email-provider.js';
import { TestEmailProvider } from './test-email.provider.js';
import type { OtpPurpose } from '../otp.util.js';
import { OTP_LIFETIME_MS } from '../otp.util.js';

export { BrevoEmailProvider, EmailProviderError } from './brevo-email.provider.js';
export type { EmailProvider, OutboundEmail } from './email-provider.js';
export { TestEmailProvider } from './test-email.provider.js';

export function buildEmailProvider(config: Pick<AppConfig, 'emailProvider' | 'brevoApiKey' | 'brevoSenderEmail' | 'brevoSenderName'>): EmailProvider {
  if (config.emailProvider === 'brevo') {
    if (config.brevoApiKey === undefined || config.brevoSenderEmail === undefined) {
      throw new Error('Brevo email provider requires BREVO_API_KEY and BREVO_SENDER_EMAIL.');
    }
    const brevoOptions: { senderName?: string } =
      config.brevoSenderName === undefined ? {} : { senderName: config.brevoSenderName };
    return new BrevoEmailProvider({
      apiKey: config.brevoApiKey,
      senderEmail: config.brevoSenderEmail,
      ...brevoOptions,
    });
  }
  return new TestEmailProvider();
}

/** Human-readable email body. The code itself is never logged or returned in API responses. */
export function renderOtpEmail(purpose: OtpPurpose, code: string): string {
  const minutes = Math.round(OTP_LIFETIME_MS / 60_000);
  const label = purpose === 'EMAIL_VERIFICATION' ? 'verify your email' : 'reset your password';
  return `Hi,\n\nYou requested to ${label} on HerNext.\n\nYour code is ${code}.\n\nThis code expires in ${minutes} minutes. If you did not request this, you can ignore this message.\n\n— HerNext`;
}