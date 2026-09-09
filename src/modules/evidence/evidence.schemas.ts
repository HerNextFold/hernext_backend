import { z } from 'zod';

export const evidenceIdParamsSchema = z.object({
  id: z.string().uuid('A valid evidence id is required'),
});

export type EvidenceIdParams = z.infer<typeof evidenceIdParamsSchema>;