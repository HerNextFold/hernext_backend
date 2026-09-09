import { z } from 'zod';
import { employmentTypeSchema } from '../experiences/experiences.schemas.js';

export const upsertProfileSchema = z
  .object({
    currentOccupation: z.string().trim().min(1, 'currentOccupation is required').max(200),
    industry: z.string().trim().min(1, 'industry is required').max(200),
    yearsOfExperience: z.number().min(0, 'yearsOfExperience cannot be negative').max(100),
    education: z.string().trim().max(300).nullable().optional(),
    employmentType: employmentTypeSchema,
    careerInterests: z.array(z.string().trim().min(1).max(200)).max(20).nullable().optional(),
    targetCareerId: z.string().uuid('targetCareerId must be a valid UUID').nullable().optional(),
    skillIds: z.array(z.string().uuid('skillIds must be valid UUIDs')).max(50).optional(),
  })
  .strict();

export type UpsertProfileBody = z.infer<typeof upsertProfileSchema>;
