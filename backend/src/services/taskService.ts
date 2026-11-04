/**
 * Task business logic. Pure functions over Prisma — no Express types leak in here, so this
 * module is directly unit-testable with Prisma mocked (code-quality.md / NFR-3).
 */
import type { Prisma, Task, TaskPriority, TaskStatus } from "@prisma/client";
import { prisma } from "../db";
import { enqueueSyncForAllProviders } from "../queue/enqueueSync";
import type { TaskSnapshot } from "../queue/types";
import { LIMITS } from "../validation";

export interface ListTasksFilters {
  status?: TaskStatus;
  assignee?: string;
  priority?: TaskPriority;
  limit?: number;
  offset?: number;
}

export interface SyncStatusSummary {
  provider: string;
  status: "ok" | "failed" | "pending";
}

export type TaskWithSyncStatus = Task & { syncStatus: SyncStatusSummary[] };

export interface ListTasksResult {
  tasks: TaskWithSyncStatus[];
  total: number;
  limit: number;
  offset: number;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  assignee?: string;
  dueDate?: Date;
  labels?: string[];
}

export type UpdateTaskInput = Partial<CreateTaskInput>;

function toSnapshot(task: Task): TaskSnapshot {
  return {
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    labels: task.labels,
  };
}

/** Fields whose change is sync-relevant, per docs/MDP-7/04-impl-plan.md M4.1. */
const SYNC_RELEVANT_FIELDS: (keyof UpdateTaskInput)[] = [
  "status",
  "priority",
  "assignee",
  "title",
  "description",
];

async function attachSyncStatus(
  tasks: Task[],
): Promise<TaskWithSyncStatus[]> {
  if (tasks.length === 0) return [];
  const taskIds = tasks.map((t) => t.id);
  const links = await prisma.syncLink.findMany({
    where: { taskId: { in: taskIds } },
  });
  const byTaskId = new Map<string, SyncStatusSummary[]>();
  for (const link of links) {
    const summary: SyncStatusSummary = {
      provider: link.provider,
      status: link.lastStatus ?? "pending",
    };
    const existing = byTaskId.get(link.taskId) ?? [];
    existing.push(summary);
    byTaskId.set(link.taskId, existing);
  }
  return tasks.map((task) => ({
    ...task,
    syncStatus: byTaskId.get(task.id) ?? [],
  }));
}

/** Lists tasks with optional filters, capped/bounded pagination (resolves B-2). */
export async function listTasks(
  filters: ListTasksFilters,
): Promise<ListTasksResult> {
  const limit = Math.min(
    filters.limit ?? LIMITS.LIST_DEFAULT_LIMIT,
    LIMITS.LIST_MAX_LIMIT,
  );
  const offset = Math.max(filters.offset ?? 0, 0);

  const where: Prisma.TaskWhereInput = {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.assignee ? { assignee: filters.assignee } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
  };

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where,
      take: limit,
      skip: offset,
      orderBy: { createdAt: "desc" },
    }),
    prisma.task.count({ where }),
  ]);

  const tasksWithSyncStatus = await attachSyncStatus(tasks);

  return { tasks: tasksWithSyncStatus, total, limit, offset };
}

export interface TaskDetail extends Task {
  syncLinks: {
    provider: string;
    externalKeyOrUrl: string | null;
    lastSyncedAt: Date | null;
    lastStatus: string | null;
    lastError: string | null;
  }[];
}

/** Returns a task with its full syncLinks[] projection (architecture §5.1), or null. */
export async function getTask(id: string): Promise<TaskDetail | null> {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return null;

  const links = await prisma.syncLink.findMany({ where: { taskId: id } });
  return {
    ...task,
    syncLinks: links.map((link) => ({
      provider: link.provider,
      externalKeyOrUrl: link.externalKeyOrUrl,
      lastSyncedAt: link.lastSyncedAt,
      lastStatus: link.lastStatus,
      lastError: link.lastError,
    })),
  };
}

/** Creates a task, then enqueues a "create" sync job for every configured provider. */
export async function createTask(input: CreateTaskInput): Promise<Task> {
  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description,
      status: input.status,
      priority: input.priority,
      assignee: input.assignee,
      dueDate: input.dueDate,
      labels: input.labels ?? [],
    },
  });

  enqueueSyncForAllProviders(task.id, "create", toSnapshot(task));
  return task;
}

/**
 * Partially updates a task. Enqueues an "update" sync job only if a sync-relevant field actually
 * changed (docs/MDP-7/04-impl-plan.md M4.1).
 */
export async function updateTask(
  id: string,
  patch: UpdateTaskInput,
): Promise<Task | null> {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return null;

  const changedSyncRelevantField = SYNC_RELEVANT_FIELDS.some(
    (field) => field in patch && patch[field] !== existing[field as keyof Task],
  );

  const updated = await prisma.task.update({
    where: { id },
    data: {
      title: patch.title,
      description: patch.description,
      status: patch.status,
      priority: patch.priority,
      assignee: patch.assignee,
      dueDate: patch.dueDate,
      labels: patch.labels,
    },
  });

  if (changedSyncRelevantField) {
    enqueueSyncForAllProviders(id, "update", toSnapshot(updated));
  }

  return updated;
}

/**
 * Idempotent delete: a second delete on an already-missing id still returns success semantics
 * (the route maps this to 204). Enqueues a "close" sync job using a snapshot taken immediately
 * before delete, so the close job never needs to re-read a now-gone Task row.
 */
export async function deleteTask(id: string): Promise<void> {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) {
    return; // idempotent: nothing to delete, still a success outcome
  }

  const snapshot = toSnapshot(existing);
  await prisma.task.delete({ where: { id } });
  enqueueSyncForAllProviders(id, "close", snapshot);
}
