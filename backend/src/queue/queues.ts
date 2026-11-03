import { Queue } from 'bullmq';
import { connection } from './connection';
import { GITHUB_QUEUE_NAME, JIRA_QUEUE_NAME } from './queueNames';
import type { SyncJobData, SyncJobInput } from './types';

// Separate queues per provider (phase-02-architecture.md Sync Pipeline,
// "sync:jira" / "sync:github") so one provider's outage/backoff never
// blocks the other's jobs. See queueNames.ts for why the literal names
// differ from the architecture doc's colon-separated spelling.
export const jiraQueue = new Queue<SyncJobData>(JIRA_QUEUE_NAME, { connection });
export const githubQueue = new Queue<SyncJobData>(GITHUB_QUEUE_NAME, { connection });

const MAX_ATTEMPTS = Number(process.env.SYNC_MAX_ATTEMPTS ?? 5);
const BACKOFF_MS = Number(process.env.SYNC_BACKOFF_MS ?? 2000);

const jobOptions = {
  attempts: MAX_ATTEMPTS,
  backoff: { type: 'exponential' as const, delay: BACKOFF_MS },
  removeOnComplete: { count: 1000 },
  // Keep failed jobs around (not removed) so they stay inspectable in
  // Redis/BullMQ UI; SyncLink/SyncAttempt are the durable record of record,
  // this is just extra debuggability.
  removeOnFail: { count: 1000 },
};

/**
 * Enqueue the same task mutation onto both sync:jira and sync:github.
 * Called from taskService — never from an HTTP handler directly — so the
 * caller only needs to await the (fast) enqueue, not job execution.
 */
export async function enqueueSyncJob(input: SyncJobInput): Promise<void> {
  await Promise.all([
    jiraQueue.add('sync', { ...input, provider: 'jira' }, jobOptions),
    githubQueue.add('sync', { ...input, provider: 'github' }, jobOptions),
  ]);
}
