import { z } from 'zod';

/**
 * Generate body. `isPublic` lets the participant explicitly enable their
 * shareable Passport at generation time (docs/SECURITY_SPEC.md §36). Defaults
 * to false - a participant is never public without asking.
 */
export const passportGenerateSchema = z
  .object({
    isPublic: z.boolean().optional(),
  })
  .strict();

/** URL-safe, opaque-enough public slug (docs/SECURITY_SPEC.md §37). */
export const passportSlugParamsSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/, 'A valid passport slug is required'),
});

export type PassportGenerateBody = z.infer<typeof passportGenerateSchema>;
export type PassportSlugParams = z.infer<typeof passportSlugParamsSchema>;