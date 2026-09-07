import { z } from 'zod';

export const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'firstName is required').max(100),
  lastName: z.string().trim().min(1, 'lastName is required').max(100),
  email: z.string().trim().toLowerCase().email('A valid email is required').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  country: z.string().trim().min(1, 'country is required').max(100),
  role: z
    .enum(['PARTICIPANT', 'ORGANIZATION_ADMIN', 'ORGANIZATION_MEMBER'])
    .optional()
    .default('PARTICIPANT'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('A valid email is required').max(254),
  password: z.string().min(1, 'Password is required').max(128),
});

export type RegisterSchema = typeof registerSchema;
export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;