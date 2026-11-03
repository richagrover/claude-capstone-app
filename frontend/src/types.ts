// Wire-level types mirroring backend/src/validation.ts and the Prisma
// schema. No spaces in enum values (UI renders friendly labels).

export const TASK_STATUSES = ['Backlog', 'InProgress', 'InReview', 'Done'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  Backlog: 'Backlog',
  InProgress: 'In Progress',
  InReview: 'In Review',
  Done: 'Done',
};

export const TASK_PRIORITIES = ['Low', 'Medium', 'High'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export type SyncProvider = 'jira' | 'github';
export type SyncStatusValue = 'synced' | 'pending' | 'failed';

export interface SyncStatusSummary {
  provider: SyncProvider;
  status: SyncStatusValue;
}

export interface SyncLinkDetail {
  provider: SyncProvider;
  externalKeyOrUrl: string | null;
  lastSyncedAt: string | null;
  lastStatus: 'ok' | 'failed' | null;
  lastError: string | null;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null;
  dueDate: string | null;
  labels: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskListItem extends Task {
  syncStatus: SyncStatusSummary[];
}

export interface TaskDetail extends Task {
  syncLinks: SyncLinkDetail[];
}

export interface TaskFilters {
  status?: TaskStatus;
  assignee?: string;
  priority?: TaskPriority;
}

export interface TaskPayload {
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string | null;
  dueDate: string | null;
  labels: string[];
}

export interface SyncHealth {
  counts: { synced: number; pending: number; failed: number };
  failing: Array<{
    taskId: string;
    provider: SyncProvider;
    lastError: string | null;
    lastSyncedAt: string | null;
    externalKeyOrUrl: string | null;
  }>;
}
