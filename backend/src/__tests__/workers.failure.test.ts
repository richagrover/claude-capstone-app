import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { SyncJobData } from '../queue/types';

// Deliberately does NOT mock ../queue/providers/* — this file exercises the
// REAL jiraProvider/githubProvider stubs (see
// backend/src/queue/providers/jiraProvider.ts and githubProvider.ts), which
// always return { ok: false } today because T-4/T-5 (real Jira/GitHub REST
// calls) are blocked_on_config. That makes this the one place TC-11/TC-14's
// *failure-surfacing* guarantee (phase-01-requirements.md §4 Reliability —
// "failed syncs are visible/flagged, not silently dropped") is actually
// exercisable right now, without a real Jira/GitHub integration. The
// "issue created in the fixed project/repo" half of TC-11/TC-14 remains
// blocked (see Coverage Gaps).
vi.mock('../db', () => ({
  prisma: {
    syncLink: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    syncAttempt: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from '../db';
import { processSyncJob } from '../queue/workers';

function makeJob(data: SyncJobData): Job<SyncJobData> {
  return { data } as Job<SyncJobData>;
}

const snapshot = {
  id: 'task-1',
  title: 'Task',
  description: null,
  status: 'Backlog',
  priority: 'Medium',
  assignee: null,
  labels: [],
  dueDate: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.JIRA_PROJECT_KEY;
  delete process.env.GITHUB_REPO;
  (prisma.syncLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
});

describe('TC-11 / TC-14 (partial — failure/retry-surfacing half only): provider error on create', () => {
  it('jira: failure is written to SyncAttempt + SyncLink.last_status=failed with last_error, and the job rethrows so BullMQ will retry', async () => {
    await expect(
      processSyncJob(makeJob({ taskId: 'task-1', provider: 'jira', operation: 'create', snapshot }))
    ).rejects.toThrow();

    expect(prisma.syncAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taskId: 'task-1', provider: 'jira', result: 'failed' }),
      })
    );
    expect(prisma.syncLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lastStatus: 'failed', lastError: expect.stringContaining('JIRA_PROJECT_KEY') }),
      })
    );
  });

  it('github: same guarantee — failure surfaces, does not get a weaker guarantee than jira', async () => {
    await expect(
      processSyncJob(makeJob({ taskId: 'task-1', provider: 'github', operation: 'create', snapshot }))
    ).rejects.toThrow();

    expect(prisma.syncAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ taskId: 'task-1', provider: 'github', result: 'failed' }),
      })
    );
    expect(prisma.syncLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lastStatus: 'failed', lastError: expect.stringContaining('GITHUB_REPO') }),
      })
    );
  });
});

describe('TC-22 (failure half): every job result, success or failure, is recorded', () => {
  it('a failed attempt still produces exactly one SyncAttempt row and one SyncLink upsert', async () => {
    await expect(
      processSyncJob(makeJob({ taskId: 'task-1', provider: 'jira', operation: 'create', snapshot }))
    ).rejects.toThrow();

    expect(prisma.syncAttempt.create).toHaveBeenCalledTimes(1);
    expect(prisma.syncLink.upsert).toHaveBeenCalledTimes(1);
  });
});
