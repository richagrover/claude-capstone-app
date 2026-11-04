import type { SyncProvider, TaskPriority, TaskStatus } from "@prisma/client";

/** The sync-relevant subset of a Task, captured at enqueue time. */
export interface TaskSnapshot {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null;
  labels: string[];
}

export type SyncOperation = "create" | "update" | "close";

/**
 * Job payload for a single provider sync job.
 *
 * `snapshot` is captured at enqueue time (architecture §6 step 2) so a `close` job — enqueued
 * right after a task delete — never needs to re-read a `Task` row that may already be gone.
 */
export interface SyncJobPayload {
  taskId: string;
  provider: SyncProvider;
  operation: SyncOperation;
  snapshot: TaskSnapshot;
}
