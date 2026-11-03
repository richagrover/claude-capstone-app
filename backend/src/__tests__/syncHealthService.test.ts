import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db', () => ({
  prisma: {
    task: { findMany: vi.fn() },
    syncLink: { findMany: vi.fn() },
  },
}));

import { prisma } from '../db';
import { getSyncHealth } from '../services/syncHealthService';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('TC-19: sync-health counts match actual SyncLink state', () => {
  it('computes synced/pending/failed from a mix of tasks, including a SyncLink for an already-deleted task', async () => {
    // t1, t2, t3 currently exist. t4 does NOT (its Task row was deleted by
    // the close-linked-issue flow), but it still has a SyncLink row from
    // before the delete — this is the exact scenario dev-agent's fix
    // (backend/src/services/syncHealthService.ts) targets.
    (prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 't1' },
      { id: 't2' },
      { id: 't3' },
    ]);
    (prisma.syncLink.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { taskId: 't1', provider: 'jira', lastStatus: 'ok', lastError: null, lastSyncedAt: new Date(), externalKeyOrUrl: 'JIRA-1' },
      { taskId: 't1', provider: 'github', lastStatus: 'failed', lastError: 'boom', lastSyncedAt: new Date(), externalKeyOrUrl: null },
      { taskId: 't2', provider: 'jira', lastStatus: 'failed', lastError: 'timeout', lastSyncedAt: new Date(), externalKeyOrUrl: null },
      // t3 has no SyncLink rows at all yet (both jobs still pending).
      // t4 no longer exists as a Task row, but its SyncLink does.
      { taskId: 't4', provider: 'jira', lastStatus: 'ok', lastError: null, lastSyncedAt: new Date(), externalKeyOrUrl: 'JIRA-4' },
    ]);

    const health = await getSyncHealth();

    expect(health.counts.synced).toBe(2); // t1-jira, t4-jira
    expect(health.counts.failed).toBe(2); // t1-github, t2-jira

    // Regression check for the bug fix: pending must be scoped to the 3
    // *existing* tasks only (expected 6 links total - 3 links that belong
    // to existing tasks = 3 pending). The pre-fix formula used
    // `totalTasks * 2 - links.length` (3*2 - 4 = 2), which under-counted
    // pending by 1 because it let t4's unrelated SyncLink row soak up one
    // of the "missing" slots that actually belongs to t2/t3.
    expect(health.counts.pending).toBe(3);
  });

  it('returns zero counts when there are no tasks and no SyncLinks', async () => {
    (prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.syncLink.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const health = await getSyncHealth();

    expect(health.counts).toEqual({ synced: 0, pending: 0, failed: 0 });
    expect(health.failing).toEqual([]);
  });
});

describe('TC-20: a failed sync appears in the failing list', () => {
  it('includes last_error and enough to link back to the task', async () => {
    (prisma.task.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([{ id: 't1' }]);
    (prisma.syncLink.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        taskId: 't1',
        provider: 'jira',
        lastStatus: 'failed',
        lastError: 'JIRA_PROJECT_KEY is not configured',
        lastSyncedAt: new Date('2026-02-01T00:00:00.000Z'),
        externalKeyOrUrl: null,
      },
    ]);

    const health = await getSyncHealth();

    expect(health.failing).toHaveLength(1);
    expect(health.failing[0]).toMatchObject({
      taskId: 't1',
      provider: 'jira',
      lastError: 'JIRA_PROJECT_KEY is not configured',
    });
  });
});
