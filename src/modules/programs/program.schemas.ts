import { z } from 'zod';

export const PROGRAM_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'] as const;

const isoDateSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'A valid ISO date is required (e.g. 2026-09-15)',
  });

export const createProgramBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Program name is required').max(120),
    description: z.string().trim().min(1, 'Program description is required').max(1000),
    startDate: isoDateSchema.optional(),
    endDate: isoDateSchema.optional(),
    status: z.enum(PROGRAM_STATUSES).optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.startDate === undefined ||
      value.endDate === undefined ||
      Date.parse(value.endDate) > Date.parse(value.startDate),
    { message: 'endDate must be after startDate', path: ['endDate'] },
  );

export const organizationIdParamsSchema = z.object({
  organizationId: z.string().uuid('A valid organization id is required'),
});

export const programIdParamsSchema = z.object({
  programId: z.string().uuid('A valid program id is required'),
});

export const addParticipantBodySchema = z
  .object({
    userId: z.string().uuid('A valid participant user id is required'),
  })
  .strict();

export const participantParamsSchema = z.object({
  programId: z.string().uuid('A valid program id is required'),
  participantId: z.string().uuid('A valid participant id is required'),
});

export type CreateProgramBody = z.infer<typeof createProgramBodySchema>;
export type AddParticipantBody = z.infer<typeof addParticipantBodySchema>;