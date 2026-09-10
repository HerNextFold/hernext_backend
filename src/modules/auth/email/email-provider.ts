import type { OtpPurpose } from '../otp.util.js';

export interface OutboundEmail {
  to: string;
  purpose: OtpPurpose;
  body: string;
}

/**
 * Delivery abstraction for outbound OTP emails. The OTP must never be logged,
 * printed, or echoed in API responses. Only the destination address, purpose
 * and rendered body are carried here.
 */
export interface EmailProvider {
  readonly name: string;
  send(input: OutboundEmail): Promise<void>;
}