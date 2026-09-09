import { describe, expect, it } from 'vitest';
import { AppError } from '../src/common/errors/app-error.js';
import { evaluateChallengeSubmission, findChallengeSpec, CHALLENGE_PASS_THRESHOLD } from '../src/lib/challenges/challenge-evaluator.js';
import {
  RECONCILIATION_SPEC,
  PAYMENT_RESOLUTION_SPEC,
  reconciliationAnswerSchema,
  paymentResolutionAnswerSchema,
} from '../src/lib/challenges/challenge-specs.js';

const RECONCILIATION_TITLE = RECONCILIATION_SPEC.title;
const PAYMENT_TITLE = PAYMENT_RESOLUTION_SPEC.title;

describe('challenge evaluator (deterministic rules)', () => {
  it('exposes both seeded challenge specs', () => {
    expect(findChallengeSpec(RECONCILIATION_TITLE)).toBe(RECONCILIATION_SPEC);
    expect(findChallengeSpec(PAYMENT_TITLE)).toBe(PAYMENT_RESOLUTION_SPEC);
    expect(findChallengeSpec('Unknown Challenge')).toBeNull();
    expect(CHALLENGE_PASS_THRESHOLD).toBe(70);
  });

  it('passes a fully correct financial reconciliation', () => {
    const result = evaluateChallengeSubmission(
      { title: RECONCILIATION_TITLE },
      {
        totalCredits: 250000,
        totalDebits: 245000,
        difference: 5000,
        discrepancyFound: true,
        explanation: 'A debit of 5,000 was recorded on the statement but is missing from the ledger.',
      },
    );
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.feedback).toContain('correctly reconciled');
  });

  it('passes when amounts and discrepancy match but the explanation is brief', () => {
    const result = evaluateChallengeSubmission(
      { title: RECONCILIATION_TITLE },
      {
        totalCredits: 250000,
        totalDebits: 245000,
        difference: 5000,
        discrepancyFound: true,
        explanation: 'Brief explanation.',
      },
    );
    expect(result.score).toBe(85);
    expect(result.passed).toBe(true);
  });

  it('fails when the numbers are correct but the discrepancy is denied', () => {
    const result = evaluateChallengeSubmission(
      { title: RECONCILIATION_TITLE },
      {
        totalCredits: 250000,
        totalDebits: 245000,
        difference: 5000,
        discrepancyFound: false,
        explanation: 'Missing 5,000.',
      },
    );
    expect(result.score).toBe(60);
    expect(result.passed).toBe(false);
    expect(result.feedback).toContain('5,000 discrepancy');
  });

  it('scores zero for a completely wrong reconciliation', () => {
    const result = evaluateChallengeSubmission(
      { title: RECONCILIATION_TITLE },
      {
        totalCredits: 100,
        totalDebits: 200,
        difference: 300,
        discrepancyFound: false,
        explanation: 'x',
      },
    );
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
  });

  it('passes a payment resolution covering all five behaviours', () => {
    const result = evaluateChallengeSubmission(
      { title: PAYMENT_TITLE },
      {
        steps: [
          'Verify the transaction status',
          'Contact the customer to explain the situation',
          'Check the payment gateway and bank records',
          'Push a refund to reverse the charge',
          'Confirm the outcome with the customer',
        ],
      },
    );
    expect(result.score).toBe(100);
    expect(result.passed).toBe(true);
    expect(result.feedback).toContain('complete');
  });

  it('passes with four of five behaviours but flags the missing one', () => {
    const result = evaluateChallengeSubmission(
      { title: PAYMENT_TITLE },
      {
        steps: [
          'Verify the transaction record',
          'Check the payment channel and bank status',
          'Push a refund to reverse the charge',
          'Follow up to close out the case',
        ],
      },
    );
    expect(result.score).toBe(80);
    expect(result.passed).toBe(true);
    expect(result.feedback).toContain('involved the customer');
  });

  it('fails at exactly three behaviours (boundary below threshold)', () => {
    const result = evaluateChallengeSubmission(
      { title: PAYMENT_TITLE },
      {
        steps: ['Verify the transaction', 'Contact the customer', 'Check the payment status'],
      },
    );
    expect(result.score).toBe(60);
    expect(result.passed).toBe(false);
  });

  it('rejects a challenge title with no evaluation rules', () => {
    expect(() =>
      evaluateChallengeSubmission({ title: 'Unseeded Challenge' }, { steps: ['Verify'] }),
    ).toThrow(AppError);
  });
});

describe('challenge answer schemas (documented fields only)', () => {
  it('rejects unknown reconciliation fields', () => {
    const result = reconciliationAnswerSchema.safeParse({
      totalCredits: 250000,
      totalDebits: 245000,
      difference: 5000,
      discrepancyFound: true,
      secretField: 'nope',
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-numeric reconciliation amounts', () => {
    const result = reconciliationAnswerSchema.safeParse({
      totalCredits: '250000',
      totalDebits: 245000,
      difference: 5000,
      discrepancyFound: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty payment steps and unknown keys', () => {
    const empty = paymentResolutionAnswerSchema.safeParse({ steps: [] });
    expect(empty.success).toBe(false);

    const unknown = paymentResolutionAnswerSchema.safeParse({
      steps: ['Verify the transaction'],
      extra: true,
    });
    expect(unknown.success).toBe(false);
  });
});