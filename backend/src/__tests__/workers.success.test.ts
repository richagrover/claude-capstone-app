import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Job } from 'bullmq';
import type { SyncJobData } from '../queue/types';

// Generic mocked SyncProviderClient test doubles — NOT the real
// jiraProvider/githubProvider stubs (those always fail until T-4/T-5 are
// unblocked; see workers.failure.test.ts). These exercise the worker's
// create/update/close *mechanics* (the T-3 job-processing logic that TC-8/
// TC-9/TC-12/TC-13/TC-15/TC-16/TC-18 depend on), independent of which
// provider sits behind the SyncProviderClient interface — see the
// "Coverage Gaps" note in phase-03-design-review.md for what remains
// blocked (the actual "create an issue in JIRA_PROJECT_KEY/GITHUB_REPO"
// portion, which needs real config/API access).
vi.mock('../queue/providers/jiraProvider', () => ({
  jiraProvider: {
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    closeIssue: vi.fn(),
  },
}));
vi.mock('../queue/providers/githubProvider', () => ({
  githubProvider: {
    createIssue: vi.fn(),
    updateIssue: vi.fn(),
    closeIssue: vi.fn(),
  },
}));

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
import { jiraProvider } from '../queue/providers/jiraProvider';
import { githubProvider } from '../queue/providers/githubProvider';
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
});

describe('TC-22: every job result (success) is written to SyncAttempt and upserted into SyncLink', () => {
  it('create: no existing SyncLink -> calls createIssue, writes ok SyncAttempt + SyncLink', async () => {
    (prisma.syncLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (jiraProvider.createIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      externalKeyOrUrl: 'JIRA-1',
    });

    await processSyncJob(
      makeJob({ taskId: 'task-1', provider: 'jira', operation: 'create', snapshot })
    );

    expect(jiraProvider.createIssue).toHaveBeenCalledWith(snapshot);
    expect(prisma.syncAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ taskId: 'task-1', provider: 'jira', result: 'ok' }) })
    );
    expect(prisma.syncLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ lastStatus: 'ok', externalKeyOrUrl: 'JIRA-1' }),
      })
    );
  });

  it('update: existing SyncLink -> calls updateIssue, not createIssue', async () => {
    (prisma.syncLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskId: 'task-1',
      provider: 'github',
      externalKeyOrUrl: 'gh-42',
    });
    (githubProvider.updateIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      externalKeyOrUrl: 'gh-42',
    });

    await processSyncJob(
      makeJob({ taskId: 'task-1', provider: 'github', operation: 'update', snapshot })
    );

    expect(githubProvider.updateIssue).toHaveBeenCalledWith(snapshot, 'gh-42');
    expect(githubProvider.createIssue).not.toHaveBeenCalled();
    expect(prisma.syncLink.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: expect.objectContaining({ lastStatus: 'ok' }) })
    );
  });

  it('close: existing SyncLink with an external key -> calls closeIssue (never delete)', async () => {
    (prisma.syncLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      taskId: 'task-1',
      provider: 'jira',
      externalKeyOrUrl: 'JIRA-1',
    });
    (jiraProvider.closeIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      externalKeyOrUrl: 'JIRA-1',
    });

    await processSyncJob(
      makeJob({ taskId: 'task-1', provider: 'jira', operation: 'close', snapshot })
    );

    expect(jiraProvider.closeIssue).toHaveBeenCalledWith('JIRA-1');
  });

  it('TC-17 worker-side half: close with no existing SyncLink no-ops (no provider call, recorded as ok)', async () => {
    (prisma.syncLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await processSyncJob(
      makeJob({ taskId: 'task-1', provider: 'jira', operation: 'close', snapshot })
    );

    expect(jiraProvider.closeIssue).not.toHaveBeenCalled();
    expect(prisma.syncAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ result: 'ok', detail: 'ok (no-op close)' }) })
    );
  });
});

describe('TC-23: one queue failing/backed up while the other is healthy', () => {
  it('a failing jira job does not prevent a concurrent github job from succeeding', async () => {
    (prisma.syncLink.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (jiraProvider.createIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      error: 'Jira API is down',
    });
    (githubProvider.createIssue as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      externalKeyOrUrl: 'gh-1',
    });

    const [jiraResult, githubResult] = await Promise.allSettled([
      processSyncJob(makeJob({ taskId: 'task-1', provider: 'jira', operation: 'create', snapshot })),
      processSyncJob(makeJob({ taskId: 'task-2', provider: 'github', operation: 'create', snapshot })),
    ]);

    // jira's job processor rethrows on failure (so BullMQ retries it) —
    // that rejection must not affect the independently-processed github job.
    expect(jiraResult.status).toBe('rejected');
    expect(githubResult.status).toBe('fulfilled');

    // Both still got their own durable audit write — the healthy provider's
    // queue keeps making progress while the unhealthy one is retried.
    expect(prisma.syncAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ taskId: 'task-1', provider: 'jira', result: 'failed' }) })
    );
    expect(prisma.syncAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ taskId: 'task-2', provider: 'github', result: 'ok' }) })
    );
  });
});
