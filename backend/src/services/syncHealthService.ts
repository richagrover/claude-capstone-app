import { prisma } from '../db';

export interface SyncHealth {
  counts: { synced: number; pending: number; failed: number };
  failing: Array<{
    taskId: string;
    provider: string;
    lastError: string | null;
    lastSyncedAt: Date | null;
    externalKeyOrUrl: string | null;
  }>;
}

const PROVIDERS_PER_TASK = 2; // jira + github

/**
 * GET /api/sync-health — computed entirely from SyncLink (never re-queries
 * Jira/GitHub live), per phase-02-architecture.md "Sync-Health Dashboard".
 */
export async function getSyncHealth(): Promise<SyncHealth> {
  const links = await prisma.syncLink.findMany();

  let synced = 0;
  let failed = 0;
  const failing: SyncHealth['failing'] = [];

  for (const link of links) {
    if (link.lastStatus === 'ok') {
      synced += 1;
    } else if (link.lastStatus === 'failed') {
      failed += 1;
      failing.push({
        taskId: link.taskId,
        provider: link.provider,
        lastError: link.lastError,
        lastSyncedAt: link.lastSyncedAt,
        externalKeyOrUrl: link.externalKeyOrUrl,
      });
    }
  }

  // "pending" = job queued/enqueued, no result (SyncLink row) yet. Every
  // task is expected to eventually have one SyncLink row per provider
  // (create always enqueues both); until a job resolves, that (task,
  // provider) pair has no row.
  const totalTasks = await prisma.task.count();
  const expectedLinks = totalTasks * PROVIDERS_PER_TASK;
  const pending = Math.max(expectedLinks - links.length, 0);

  return {
    counts: { synced, pending, failed },
    failing,
  };
}
