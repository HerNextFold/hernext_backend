import { z } from 'zod';

export const challengeIdParamsSchema = z.object({
  id: z.string().uuid('A valid challenge id is required'),
});

export const challengesQuerySchema = z.object({
  skillId: z.string().uuid('A valid skill id is required').optional(),
  difficulty: z.enum(['BEGINNER', 'INTERMEDIATE', 'ADVANCED']).optional(),
});

/**
 * The submit body only carries the participant's `answer` object. The concrete
 * answer fields are documented fields only - the challenge-specific Zod schema
 * in the challenge spec rejects unknown keys (mass-assignment protection,
 * docs/SECURITY_SPEC.md §20).
 */
export const submitBodySchema = z
  .object({
    answer: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export type ChallengeIdParams = z.infer<typeof challengeIdParamsSchema>;
export type ChallengesQuery = z.infer<typeof challengesQuerySchema>;
export type SubmitBody = z.infer<typeof submitBodySchema>;