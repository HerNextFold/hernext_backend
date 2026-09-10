import { z } from 'zod';

export const createOrganizationBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Organization name is required').max(120),
    description: z.string().trim().min(1, 'Organization description is required').max(1000),
    country: z.string().trim().min(1, 'Country is required').max(100),
  })
  .strict();

export const organizationIdParamsSchema = z.object({
  organizationId: z.string().uuid('A valid organization id is required'),
});

export type CreateOrganizationBody = z.infer<typeof createOrganizationBodySchema>;
export type OrganizationIdParams = z.infer<typeof organizationIdParamsSchema>;