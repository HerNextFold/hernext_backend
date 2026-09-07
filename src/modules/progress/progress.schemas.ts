import { z } from 'zod';

export const taskStatusSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED']),
});

export const taskIdParamsSchema = z.object({
  taskId: z.string().uuid('A valid task id is required'),
});

export type TaskStatusBody = z.infer<typeof taskStatusSchema>;
export type TaskIdParams = z.infer<typeof taskIdParamsSchema>;