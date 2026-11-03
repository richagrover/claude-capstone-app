import { z } from 'zod';

// Wire-level enum values. No spaces (Prisma enum identifiers can't contain
// them) — the UI is responsible for rendering friendly labels (e.g.
// "InProgress" -> "In Progress") per docs/requirements.md §3.1's workflow.
export const TASK_STATUS_VALUES = ['Backlog', 'InProgress', 'InReview', 'Done'] as const;
export const TASK_PRIORITY_VALUES = ['Low', 'Medium', 'High'] as const;

export const createTaskSchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().nullable().optional(),
  status: z.enum(TASK_STATUS_VALUES).optional(),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
  assignee: z.string().nullable().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  labels: z.array(z.string()).optional(),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;

// PATCH accepts a partial object — only mapped fields (priority/status/
// assignee) trigger a sync job per phase-02-architecture.md REST API Surface.
export const updateTaskSchema = createTaskSchema.partial();

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

export const taskQuerySchema = z.object({
  status: z.enum(TASK_STATUS_VALUES).optional(),
  assignee: z.string().optional(),
  priority: z.enum(TASK_PRIORITY_VALUES).optional(),
});

export type TaskQuery = z.infer<typeof taskQuerySchema>;
