import type { Job } from 'bullmq';
import { prisma } from '../db';
import { jiraProvider } from './providers/jiraProvider';
import { githubProvider } from './providers/githubProvider';
import type { ProviderCallResult, SyncProviderClient } from './providerInterface';
import type { SyncJobData } from './types';

const PROVIDER_CLIENTS: Record<SyncJobData['provider'], SyncProviderClient> = {
  jira: jiraProvider,
  github: githubProvider,
};

/**
 * Shared job processor for both sync-jira and sync-github queues (T-3;
 * see queueNames.ts for the naming deviation from the architecture doc).
 * On every result (success or failure) it:
 *   1. appends an immutable SyncAttempt row (audit trail), and
 *   2. upserts SyncLink.last_status/last_error (current state for the
 *      syncStatus[]/syncLinks[] read-time projections).
 * On failure it re-throws so BullMQ applies the queue's exponential-backoff
 * retry policy; once the configured attempt cap is exhausted the job's
 * final SyncAttempt/SyncLink write already recorded the failure, so nothing
 * is silently dropped (phase-02-architecture.md Sync Pipeline step 5).
 */
export async function processSyncJob(job: Job<SyncJobData>): Promise<void> {
  const { taskId, provider, operation, snapshot } = job.data;
  const client = PROVIDER_CLIENTS[provider];

  const existingLink = await prisma.syncLink.findUnique({
    where: { taskId_provider: { taskId, provider } },
  });

  let result: ProviderCallResult;
  try {
    if (operation === 'close') {
      if (!existingLink?.externalKeyOrUrl) {
        // Nothing was ever synced for this task/provider — no external
        // issue exists to close. Treat as a no-op success rather than a
        // failure (there is nothing to retry).
        result = { ok: true, externalKeyOrUrl: '' };
      } else {
        result = await client.closeIssue(existingLink.externalKeyOrUrl);
      }
    } else if (!existingLink?.externalKeyOrUrl) {
      result = await client.createIssue(snapshot);
    } else {
      result = await client.updateIssue(snapshot, existingLink.externalKeyOrUrl);
    }
  } catch (err) {
    result = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const now = new Date();

  // Append-only audit trail — written even though the owning Task row may
  // already be deleted (close flow), which is why taskId is not an FK here.
  await prisma.syncAttempt.create({
    data: {
      taskId,
      provider,
      result: result.ok ? 'ok' : 'failed',
      detail: result.ok ? result.externalKeyOrUrl || 'ok (no-op close)' : result.error,
    },
  });

  await prisma.syncLink.upsert({
    where: { taskId_provider: { taskId, provider } },
    create: {
      taskId,
      provider,
      externalKeyOrUrl: result.ok ? result.externalKeyOrUrl || null : existingLink?.externalKeyOrUrl ?? null,
      lastSyncedAt: now,
      lastStatus: result.ok ? 'ok' : 'failed',
      lastError: result.ok ? null : result.error,
    },
    update: {
      externalKeyOrUrl: result.ok && result.externalKeyOrUrl ? result.externalKeyOrUrl : undefined,
      lastSyncedAt: now,
      lastStatus: result.ok ? 'ok' : 'failed',
      lastError: result.ok ? null : result.error,
    },
  });

  if (!result.ok) {
    // Re-throw so BullMQ counts this attempt and schedules the next retry
    // (or marks the job permanently failed once attempts are exhausted).
    throw new Error(result.error);
  }
}
