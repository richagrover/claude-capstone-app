import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// taskService.ts imports `prisma` from '../db' and `enqueueSyncJob` from
// '../queue/queues'. Mocking both here avoids needing a real Postgres
// (DATABASE_URL) or Redis (REDIS_URL) connection to exercise the HTTP layer
// — see the "Test Setup" note added to phase-03-design-review.md for the
// rationale (pragmatic choice: mock @prisma/client's call sites rather than
// spin up a real test DB, since neither Postgres nor Redis is available in
// this sandbox).
vi.mock('../db', () => ({
  prisma: {
    task: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    syncLink: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    syncAttempt: {
      create: vi.fn(),
    },
  },
}));

vi.mock('../queue/queues', () => ({
  enqueueSyncJob: vi.fn().mockResolvedValue(undefined),
}));

import { createApp } from '../app';
import { prisma } from '../db';
import { enqueueSyncJob } from '../queue/queues';

const app = createApp();

function makeTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'task-1',
    title: 'Write tests',
    description: 'cover the CRUD surface',
    status: 'Backlog',
    priority: 'Medium',
    assignee: 'alice',
    dueDate: null,
    labels: ['backend'],
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  (prisma.syncLink.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
});

describe('TC-1: create task with all fields', () => {
  it('persists the task and GET /api/tasks/:id returns it', async () => {
    const created = makeTask();
    (prisma.task.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);

    const createRes = await request(app).post('/api/tasks').send({
      title: created.title,
      description: created.description,
      status: created.status,
      priority: created.priority,
      assignee: created.assignee,
      labels: created.labels,
    });

    expect(createRes.status).toBe(201);
    expect(createRes.body.id).toBe('task-1');
    expect(enqueueSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', operation: 'create' })
    );

    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    const getRes = await request(app).get('/api/tasks/task-1');
    expect(getRes.status).toBe(200);
    expect(getRes.body.id).toBe('task-1');
    expect(getRes.body.title).toBe('Write tests');
  });
});

describe('TC-2: create task missing required field (title)', () => {
  it('returns 400 and creates no row', async () => {
    const res = await request(app).post('/api/tasks').send({ description: 'no title here' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation_error');
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(enqueueSyncJob).not.toHaveBeenCalled();
  });
});

describe('TC-3: update task fields', () => {
  it('saves the change and advances updated_at', async () => {
    const existing = makeTask();
    const updated = makeTask({
      description: 'updated description',
      updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    });
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const res = await request(app)
      .patch('/api/tasks/task-1')
      .send({ description: 'updated description' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('updated description');
    expect(new Date(res.body.updatedAt).getTime()).toBeGreaterThan(
      new Date(existing.updatedAt).getTime()
    );
  });

  it('returns 404 for a task that does not exist', async () => {
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const res = await request(app).patch('/api/tasks/missing').send({ title: 'x' });
    expect(res.status).toBe(404);
  });
});

describe('TC-4: delete task', () => {
  it('removes the task row and enqueues the close-linked-issues job', async () => {
    const existing = makeTask();
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (prisma.task.delete as ReturnType<typeof vi.fn>).mockResolvedValue(existing);

    const res = await request(app).delete('/api/tasks/task-1');

    expect(res.status).toBe(204);
    expect(prisma.task.delete).toHaveBeenCalledWith({ where: { id: 'task-1' } });
    // See TC-17 in taskService.test.ts for why a close job is enqueued here
    // unconditionally (behavior differs from the checklist's original
    // wording — net effect is still "no issue ever gets closed for a task
    // that was never synced", just implemented at the job layer).
    expect(enqueueSyncJob).toHaveBeenCalledWith(
      expect.objectContaining({ taskId: 'task-1', operation: 'close' })
    );
  });
});

describe('TC-5: status transition through full workflow', () => {
  it('Backlog -> InProgress -> InReview -> Done each succeed', async () => {
    const sequence = ['Backlog', 'InProgress', 'InReview', 'Done'];
    for (let i = 0; i < sequence.length - 1; i += 1) {
      const existing = makeTask({ status: sequence[i] });
      const updated = makeTask({ status: sequence[i + 1] });
      (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
      (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

      const res = await request(app).patch('/api/tasks/task-1').send({ status: sequence[i + 1] });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(sequence[i + 1]);
    }
  });
});

describe('TC-6: invalid status transition (if workflow is enforced)', () => {
  it('currently succeeds — no transition-order enforcement is implemented', async () => {
    // This records *actual* behavior, not the checklist's original
    // expectation. Neither phase-01-requirements.md nor
    // phase-02-architecture.md mandates rejecting out-of-order status
    // jumps (the checklist itself hedges with "if workflow is enforced").
    // Flagged in Coverage Gaps as a design question for
    // architecture-agent/requirements-agent to resolve, not a dev bug.
    const existing = makeTask({ status: 'Backlog' });
    const updated = makeTask({ status: 'Done' });
    (prisma.task.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(existing);
    (prisma.task.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);

    const res = await request(app).patch('/api/tasks/task-1').send({ status: 'Done' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Done');
  });
});

describe('TC-7: filter list by status/assignee/priority', () => {
  it('passes filters through to the Prisma where clause', async () => {
    (prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeTask({ status: 'InProgress', assignee: 'alice', priority: 'High' }),
    ]);

    const res = await request(app)
      .get('/api/tasks')
      .query({ status: 'InProgress', assignee: 'alice', priority: 'High' });

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'InProgress', assignee: 'alice', priority: 'High' },
      })
    );
  });

  it('rejects an invalid enum filter value with 400', async () => {
    const res = await request(app).get('/api/tasks').query({ status: 'NotAStatus' });
    expect(res.status).toBe(400);
  });
});
