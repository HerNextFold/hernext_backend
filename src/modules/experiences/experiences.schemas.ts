import { z } from 'zod';

export const employmentTypeSchema = z.enum([
  'EMPLOYED',
  'SELF_EMPLOYED',
  'FREELANCER',
  'STUDENT',
  'UNEMPLOYED',
  'INFORMAL_WORKER',
]);

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
  .transform((value) => new Date(`${value}T00:00:00.000Z`))
  .nullable()
  .optional();

export const createExperienceSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(200),
  description: z.string().trim().min(1, 'description is required').max(5000),
  organization: z.string().trim().max(200).nullable().optional(),
  years: z.number().min(0).max(100).nullable().optional(),
  employmentType: employmentTypeSchema,
  startDate: optionalDate,
  endDate: optionalDate,
});

export const updateExperienceSchema = z
  .object({
    title: z.string().trim().min(1, 'title cannot be empty').max(200).optional(),
    description: z.string().trim().min(1, 'description cannot be empty').max(5000).optional(),
    organization: z.string().trim().max(200).nullable().optional(),
    years: z.number().min(0).max(100).nullable().optional(),
    employmentType: employmentTypeSchema.optional(),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be provided',
  });

export const experienceIdParamsSchema = z.object({
  id: z.string().uuid('A valid experience id is required'),
});

export type CreateExperienceBody = z.infer<typeof createExperienceSchema>;
export type UpdateExperienceBody = z.infer<typeof updateExperienceSchema>;
export type ExperienceIdParams = z.infer<typeof experienceIdParamsSchema>;
