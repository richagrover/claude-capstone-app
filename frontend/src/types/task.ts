/**
 * Mirrors backend Task/SyncLink shapes (docs/MDP-7/02-architecture.md §4, §5.1). Manually kept
 * in sync — the architecture does not specify a shared-types package, so this duplicated
 * contract boundary is an explicit, intentional choice (docs/MDP-7/04-impl-plan.md M11.1).
 */

export type TaskStatus = "Backlog" | "InProgress" | "InReview" | "Done";
export type TaskPriority = "Low" | "Medium" | "High";
export type SyncProvider = "github" | "jira";
export type SyncResult = "ok" | "failed" | "pending";

export interface SyncStatusSummary {
  provider: SyncProvider;
  status: SyncResult;
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
  syncStatus?: SyncStatusSummary[];
}

export interface SyncLinkDetail {
  provider: SyncProvider;
  externalKeyOrUrl: string | null;
  lastSyncedAt: string | null;
  lastStatus: SyncResult | null;
  lastError: string | null;
}

export interface TaskDetail extends Task {
  syncLinks: SyncLinkDetail[];
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  limit: number;
  offset: number;
}

export interface TaskFilters {
  status?: TaskStatus;
  assignee?: string;
  priority?: TaskPriority;
  limit?: number;
  offset?: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee?: string;
  dueDate?: string;
  labels?: string[];
}

export type UpdateTaskInput = Partial<CreateTaskInput>;

export interface ProviderCounts {
  ok: number;
  failed: number;
  pending: number;
}

export interface FailingTaskSummary {
  taskId: string;
  provider: SyncProvider;
  lastError: string | null;
}

export interface SyncHealthResponse {
  counts: ProviderCounts;
  byProvider: Record<string, ProviderCounts>;
  failing: FailingTaskSummary[];
}
