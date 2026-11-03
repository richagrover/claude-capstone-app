import { Prisma, type Task, type SyncLink } from '@prisma/client';
import { prisma } from '../db';
import { enqueueSyncJob } from '../queue/queues';
import type { TaskSyncPayload } from '../queue/providerInterface';
import type { SyncProviderName } from '../queue/types';
import type { CreateTaskInput, TaskQuery, UpdateTaskInput } from '../validation';

const SYNC_PROVIDERS: SyncProviderName[] = ['jira', 'github'];

// Only these fields trigger a sync job on PATCH, per phase-02-architecture.md
// REST API Surface ("PATCH ... only mapped fields (priority, status,
// assignee) trigger a sync job").
const MAPPED_FIELDS = ['priority', 'status', 'assignee'] as const;

export type SyncStatusSummary = { provider: SyncProviderName; status: 'synced' | 'pending' | 'failed' };

function toSyncPayload(task: Task): TaskSyncPayload {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    assignee: task.assignee,
    labels: task.labels,
    dueDate: task.dueDate,
  };
}

function buildSyncStatusSummary(links: SyncLink[]): SyncStatusSummary[] {
  return SYNC_PROVIDERS.map((provider) => {
    const link = links.find((l) => l.provider === provider);
    if (link?.lastStatus === 'ok') return { provider, status: 'synced' as const };
    if (link?.lastStatus === 'failed') return { provider, status: 'failed' as const };
    // No SyncLink row yet == job queued/running, no result yet.
    return { provider, status: 'pending' as const };
  });
}

/** GET /api/tasks — list + filters + lightweight syncStatus[] summary. */
export async function listTasks(filters: TaskQuery) {
  const where: Prisma.TaskWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.assignee) where.assignee = filters.assignee;
  if (filters.priority) where.priority = filters.priority;

  const tasks = await prisma.task.findMany({ where, orderBy: { createdAt: 'desc' } });

  const taskIds = tasks.map((t) => t.id);
  const links = taskIds.length
    ? await prisma.syncLink.findMany({ where: { taskId: { in: taskIds } } })
    : [];

  const linksByTask = new Map<string, SyncLink[]>();
  for (const link of links) {
    const list = linksByTask.get(link.taskId) ?? [];
    list.push(link);
    linksByTask.set(link.taskId, list);
  }

  return tasks.map((task) => ({
    ...task,
    syncStatus: buildSyncStatusSummary(linksByTask.get(task.id) ?? []),
  }));
}

/** GET /api/tasks/:id — full task + full syncLinks[] detail. */
export async function getTaskById(id: string) {
  const task = await prisma.task.findUnique({ where: { id } });
  if (!task) return null;

  const links = await prisma.syncLink.findMany({ where: { taskId: id } });

  return {
    ...task,
    syncLinks: links.map((l) => ({
      provider: l.provider,
      externalKeyOrUrl: l.externalKeyOrUrl,
      lastSyncedAt: l.lastSyncedAt,
      lastStatus: l.lastStatus,
      lastError: l.lastError,
    })),
  };
}

/** POST /api/tasks — create; always enqueues a create sync job. */
export async function createTask(input: CreateTaskInput) {
  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? null,
      status: input.status ?? 'Backlog',
      priority: input.priority ?? 'Medium',
      assignee: input.assignee ?? null,
      dueDate: input.dueDate ?? null,
      labels: input.labels ?? [],
    },
  });

  await enqueueSyncJob({ taskId: task.id, operation: 'create', snapshot: toSyncPayload(task) });

  return task;
}

/** PATCH /api/tasks/:id — partial update; enqueues a sync job only if a mapped field actually changed. */
export async function updateTask(id: string, patch: UpdateTaskInput) {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return null;

  const data: Prisma.TaskUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.description !== undefined) data.description = patch.description;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.assignee !== undefined) data.assignee = patch.assignee;
  if (patch.dueDate !== undefined) data.dueDate = patch.dueDate;
  if (patch.labels !== undefined) data.labels = patch.labels;

  const updated = await prisma.task.update({ where: { id }, data });

  const mappedFieldChanged = MAPPED_FIELDS.some(
    (field) => patch[field] !== undefined && existing[field] !== updated[field]
  );

  if (mappedFieldChanged) {
    await enqueueSyncJob({ taskId: updated.id, operation: 'update', snapshot: toSyncPayload(updated) });
  }

  return updated;
}

/**
 * DELETE /api/tasks/:id — deletes the task row, then enqueues a
 * close-linked-issues job using a snapshot captured *before* delete (the
 * Task row is gone by the time the job runs).
 */
export async function deleteTask(id: string) {
  const existing = await prisma.task.findUnique({ where: { id } });
  if (!existing) return null;

  await prisma.task.delete({ where: { id } });

  await enqueueSyncJob({ taskId: id, operation: 'close', snapshot: toSyncPayload(existing) });

  return existing;
}
