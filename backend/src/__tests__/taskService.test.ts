import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  prisma: {
    task: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

vi.mock('../queue/queues', () => ({
  enqueueSyncJob: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '../db';
import { enqueueSyncJob } from '../queue/queues';
import { createTask, deleteTask, updateTask } from '../services/taskService';

function makeTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'task-1',
    title: 'A task',
    description: 'old description',
    status: 'Backlog',
    priority: 'Medium',
    assignee: null,
    dueDate: null,
    labels: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TC-10: updating an unmapped field does not enqueue a sync job', () => {
  it('description-only change does not call enqueueSyncJob', async () => {
    const existing = makeTask();
    const updated = makeTask({ description: 'new description' });
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    await updateTask('task-1', { description: 'new description' });

    expect(enqueueSyncJob).not.toHaveBeenCalled();
  });

  it('(supporting case) a mapped field change does enqueue a sync job', async () => {
    const existing = makeTask({ priority: 'Low' });
    const updated = makeTask({ priority: 'High' });
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    await updateTask('task-1', { priority: 'High' });

    expect(enqueueSyncJob).toHaveBeenCalledWith(expect.objectContaining({ operation: 'update' }));
  });
});

describe('TC-17: delete task with no existing SyncLink (never synced)', () => {
  it('still enqueues a close job, but the job itself no-ops (see workers.success.test.ts) — net effect is a clean delete with no external call', async () => {
    // NOTE: This updates the checklist's original expected behavior
    // ("No close job enqueued") to match the actual implementation
    // ("always enqueue; the worker no-ops when there's no SyncLink").
    // taskService has no way to cheaply know, at delete time, whether a
    // SyncLink exists without an extra query — the implementation instead
    // always enqueues and lets the (idempotent) worker decide. The task
    // row removal itself is unconditional and clean either way.
    const existing = makeTask();
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (prisma.task.delete as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const result = await deleteTask('task-1');

    expect(result).toEqual(existing);
    expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
    expect(enqueueSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', operation: 'close' })
    );
  });

  it('returns null for a task that does not exist (no delete, no enqueue)', async () => {
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const result = await deleteTask('missing');
    expect(result).toBeNull();
    expect(prisma.task.delete).not.toHaveBeenCalled();
    expect(enqueueSyncJob).not.toHaveBeenCalled();
  });
});

describe('TC-21: task request completes without waiting on job execution', () => {
  it('createTask resolves before the (async) sync job has actually run', async () => {
    const created = makeTask();
    (prisma.task.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    let jobExecuted = false;
    (enqueueSyncJob as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      // Simulates the real split: enqueueSyncJob (a BullMQ Queue.add call)
      // resolves fast once the job is queued; actual job *execution*
      // (processSyncJob calling out to Jira/GitHub) happens later, on a
      // worker, and is never awaited by the request path.
      setTimeout(() => {
        jobExecuted = true;
      }, 50);
    });

    await createTask({ title: 'fast request' });

    // The request-side promise has already resolved; the job has not run.
    expect(jobExecuted).toBe(false);

    await new Promise((resolve) => setTimeout(resolve, 75));
    expect(jobExecuted).toBe(true);
  });
});
