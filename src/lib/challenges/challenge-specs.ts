/**
 * Challenge answer specifications (docs/PRODUCT_SPEC.md §20–§21,
 * docs/DATABASE_SCHEMA.md §17–§19, docs/AI_SPEC.md §22).
 *
 * Only the two seeded MVP challenges are supported. Each spec:
 *   - defines the Zod schema that the participant answer must satisfy
 *     (mass-assignment protection - only documented fields are accepted)
 *   - declares the deterministic comparison against a fixed fictional
 *     scenario, so pass/fail never depends on an LLM.
 *
 * The reconciliation scenario uses fixed fictional values (250,000 in credits
 * vs 245,000 in debits leaving a 5,000 discrepancy) so any participant can be
 * scored deterministically.
 */

import { z } from 'zod';

export const reconciliationAnswerSchema = z
  .object({
    totalCredits: z.number().int().nonnegative('Total credits must be a non-negative integer'),
    totalDebits: z.number().int().nonnegative('Total debits must be a non-negative integer'),
    difference: z.number().int().nonnegative('Difference must be a non-negative integer'),
    discrepancyFound: z.boolean(),
    explanation: z.string().min(1).max(2000).optional(),
  })
  .strict();

export const paymentResolutionAnswerSchema = z
  .object({
    steps: z.array(z.string().min(1).max(1000)).min(1).max(20),
    explanation: z.string().min(1).max(2000).optional(),
  })
  .strict();

export type ReconciliationAnswer = z.infer<typeof reconciliationAnswerSchema>;
export type PaymentResolutionAnswer = z.infer<typeof paymentResolutionAnswerSchema>;

export interface ChallengeEvaluationComponent {
  label: string;
  passed: boolean;
  points: number;
  max: number;
}

export interface ChallengeSpec {
  title: string;
  answerSchema: z.ZodType;
  evaluate: (answer: unknown) => {
    components: ChallengeEvaluationComponent[];
    feedback: string;
  };
}

const EXPECTED_CREDITS = 250000;
const EXPECTED_DEBITS = 245000;
const EXPECTED_DIFFERENCE = 5000;

const WEIGHT_CREDITS = 20;
const WEIGHT_DEBITS = 20;
const WEIGHT_DIFFERENCE = 20;
const WEIGHT_DISCREPANCY = 25;
const WEIGHT_EXPLANATION = 15;

function numberComponent(value: unknown, expected: number, label: string, weight: number): ChallengeEvaluationComponent {
  const ok = typeof value === 'number' && value === expected;
  return {
    label,
    passed: ok,
    points: ok ? weight : 0,
    max: weight,
  };
}

function buildReconciliationFeedback(
  components: ChallengeEvaluationComponent[],
  answer: Partial<ReconciliationAnswer>,
): string {
  const failed = components.filter((c) => !c.passed).map((c) => c.label.toLowerCase());
  if (failed.length === 0) {
    return 'You correctly reconciled the fictional transaction data and identified the discrepancy.';
  }
  const bits = [`Review: ${failed.join('; ')}.`];
  if (answer.discrepancyFound === false) {
    bits.push('The data shows a 5,000 discrepancy that should be flagged.');
  }
  if (typeof answer.explanation !== 'string' || answer.explanation.trim().length < 20) {
    bits.push('Add a fuller explanation of where the discrepancy came from.');
  }
  return bits.join(' ');
}

export const RECONCILIATION_SPEC: ChallengeSpec = {
  title: 'Financial Reconciliation Challenge',
  answerSchema: reconciliationAnswerSchema,
  evaluate(unknownAnswer) {
    const answer = unknownAnswer as ReconciliationAnswer;
    const components: ChallengeEvaluationComponent[] = [
      numberComponent(answer.totalCredits, EXPECTED_CREDITS, 'correct credit total', WEIGHT_CREDITS),
      numberComponent(answer.totalDebits, EXPECTED_DEBITS, 'correct debit total', WEIGHT_DEBITS),
      numberComponent(answer.difference, EXPECTED_DIFFERENCE, 'correct difference', WEIGHT_DIFFERENCE),
      {
        label: 'discrepancy identified',
        passed: answer.discrepancyFound === true,
        points: answer.discrepancyFound === true ? WEIGHT_DISCREPANCY : 0,
        max: WEIGHT_DISCREPANCY,
      },
    ];

    const hasExplanation =
      typeof answer.explanation === 'string' && answer.explanation.trim().length >= 20;
    components.push({
      label: 'discrepancy explained',
      passed: hasExplanation,
      points: hasExplanation ? WEIGHT_EXPLANATION : 0,
      max: WEIGHT_EXPLANATION,
    });

    return {
      components,
      feedback: buildReconciliationFeedback(components, answer),
    };
  },
};

/** Behaviours a complete customer payment resolution must demonstrate. */
const PAYMENT_BEHAVIOURS: Array<{
  label: string;
  keywords: string[];
}> = [
  {
    label: 'verified the transaction',
    keywords: ['verify', 'check', 'review', 'investigate', 'look into'],
  },
  {
    label: 'involved the customer',
    keywords: ['customer', 'contact', 'speak to', 'reach out', 'communicate', 'notify', 'inform', 'call'],
  },
  {
    label: 'checked the payment channel',
    keywords: ['payment', 'transaction', 'bank', 'gateway', 'fund', 'account', 'network', 'status'],
  },
  {
    label: 'arranged a resolution',
    keywords: ['refund', 'reverse', 'reissue', 'reprocess', 're-run', 'rerun', 'resolve', 'credit'],
  },
  {
    label: 'confirmed the outcome',
    keywords: ['confirm', 'follow up', 'follow-up', 'followup', 'document', 'escalate', 'close out'],
  },
];

const BEHAVIOUR_POINTS = 20;

function detectBehaviours(stepText: string): ChallengeEvaluationComponent[] {
  return PAYMENT_BEHAVIOURS.map((behaviour) => {
    const matched = behaviour.keywords.some((keyword) => stepText.includes(keyword));
    return {
      label: behaviour.label,
      passed: matched,
      points: matched ? BEHAVIOUR_POINTS : 0,
      max: BEHAVIOUR_POINTS,
    };
  });
}

function buildPaymentFeedback(components: ChallengeEvaluationComponent[]): string {
  const missing = components.filter((c) => !c.passed).map((c) => c.label);
  if (missing.length === 0) {
    return 'You outlined a complete, customer-first payment resolution process.';
  }
  return `Good coverage. Consider also: ${missing.join('; ')}.`;
}

export const PAYMENT_RESOLUTION_SPEC: ChallengeSpec = {
  title: 'Customer Payment Resolution Challenge',
  answerSchema: paymentResolutionAnswerSchema,
  evaluate(unknownAnswer) {
    const answer = unknownAnswer as PaymentResolutionAnswer;
    const stepText = answer.steps.join(' ').toLowerCase();
    const components = detectBehaviours(stepText);
    return {
      components,
      feedback: buildPaymentFeedback(components),
    };
  },
};

/** Registered evaluation specs, keyed by the stable seeded challenge title. */
export const CHALLENGE_SPECS: Record<string, ChallengeSpec> = {
  [RECONCILIATION_SPEC.title]: RECONCILIATION_SPEC,
  [PAYMENT_RESOLUTION_SPEC.title]: PAYMENT_RESOLUTION_SPEC,
};