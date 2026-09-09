import { z } from 'zod';

/**
 * Zod schemas that validate structured AI output (docs/AI_SPEC.md §18–§20).
 * Every AI response must pass the relevant schema before any business matching
 * or persistence. Malformed/missing/invalid output fails here.
 */

export const careerImpactOutputSchema = z.object({
  automationTasks: z.array(z.string().min(1)).max(50).default([]),
  augmentedTasks: z.array(z.string().min(1)).max(50).default([]),
  humanStrengths: z.array(z.string().min(1)).max(50).default([]),
  emergingSkills: z.array(z.string().min(1)).max(20).default([]),
  explanation: z.string().min(1).max(2000),
});

export const transferableSkillsOutputSchema = z.object({
  skills: z
    .array(
      z.object({
        skillName: z.string().min(1),
        reason: z.string().min(1).max(1000),
        confidence: z.number().min(0).max(1),
      }),
    )
    .max(40),
});

export const roadmapOutputSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  phases: z.object({
    30: z.array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(2000),
        skillName: z.string().min(1),
        estimatedMinutes: z.number().min(1).max(600).optional(),
      }),
    ),
    60: z.array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(2000),
        skillName: z.string().min(1),
        estimatedMinutes: z.number().min(1).max(600).optional(),
      }),
    ),
    90: z.array(
      z.object({
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(2000),
        skillName: z.string().min(1),
        estimatedMinutes: z.number().min(1).max(600).optional(),
      }),
    ),
  }),
});

export type CareerImpactOutput = z.infer<typeof careerImpactOutputSchema>;
export type TransferableSkillsOutput = z.infer<typeof transferableSkillsOutputSchema>;
export type RoadmapOutput = z.infer<typeof roadmapOutputSchema>;

/* Request validation schemas (docs/API_CONTRACT.md §7). */
export const aiExperienceIdParamsSchema = z.object({
  experienceId: z.string().uuid('A valid experience id is required'),
});

export const aiCareerIdParamsSchema = z.object({
  careerId: z.string().uuid('A valid career id is required'),
});

/** `?regenerate=true` forces a fresh AI analysis instead of reusing persisted output. */
export const regenerateQuerySchema = z.object({
  regenerate: z.coerce.boolean().optional(),
});

export const limitQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export const roadmapGenerateSchema = z.object({
  careerPathId: z.string().uuid('A valid career id is required'),
});

export type AiExperienceIdParams = z.infer<typeof aiExperienceIdParamsSchema>;
export type AiCareerIdParams = z.infer<typeof aiCareerIdParamsSchema>;
export type RegenerateQuery = z.infer<typeof regenerateQuerySchema>;
export type LimitQuery = z.infer<typeof limitQuerySchema>;
export type RoadmapGenerateBody = z.infer<typeof roadmapGenerateSchema>;