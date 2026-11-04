/**
 * Sync-health aggregation (resolves B-1: grouped aggregate backed by SyncLink(provider,
 * lastStatus) index, plus a short in-memory TTL cache to absorb bursty polling).
 */
import type { SyncProvider } from "@prisma/client";
import { prisma } from "../db";
import { configuredProviders } from "../queue/enqueueSync";

export const SYNC_HEALTH_CACHE_TTL_MS = 5000;
const FAILING_LIST_PAGE_SIZE = 50;

export interface ProviderCounts {
  ok: number;
  failed: number;
  pending: number;
}

export interface FailingTaskSummary {
  taskId: string;
  provider: SyncProvider;
  lastError: string | null;
}

export interface SyncHealthResult {
  counts: ProviderCounts;
  byProvider: Record<string, ProviderCounts>;
  failing: FailingTaskSummary[];
}

type CacheEntry = { expiresAt: number; value: SyncHealthResult };
const cache = new Map<string, CacheEntry>();

function cacheKey(provider?: SyncProvider): string {
  return provider ?? "__all__";
}

/** Exposed for tests only — clears the process-local cache between test cases. */
export function clearSyncHealthCache(): void {
  cache.clear();
}

function emptyCounts(): ProviderCounts {
  return { ok: 0, failed: 0, pending: 0 };
}

async function computeSyncHealth(
  provider?: SyncProvider,
): Promise<SyncHealthResult> {
  const providersToReport = provider ? [provider] : configuredProviders();

  const existingTaskIds = (
    await prisma.task.findMany({ select: { id: true } })
  ).map((t) => t.id);
  const existingTaskCount = existingTaskIds.length;

  const byProvider: Record<string, ProviderCounts> = {};
  for (const p of providersToReport) {
    byProvider[p] = emptyCounts();
  }

  if (existingTaskCount > 0) {
    // Grouped aggregate over SyncLink, scoped to currently-existing tasks only — a deleted
    // task's stale SyncLink row must never count toward the denominator (architecture §4).
    const grouped = await prisma.syncLink.groupBy({
      by: ["provider", "lastStatus"],
      where: { taskId: { in: existingTaskIds } },
      _count: { _all: true },
    });

    for (const row of grouped) {
      const bucket = byProvider[row.provider] ?? emptyCounts();
      if (row.lastStatus === "ok") bucket.ok += row._count._all;
      else if (row.lastStatus === "failed") bucket.failed += row._count._all;
      // lastStatus === null rows are jobs enqueued but not yet resolved; folded into "pending"
      // via the derivation below rather than counted here directly.
      byProvider[row.provider] = bucket;
    }

    for (const p of providersToReport) {
      const bucket = byProvider[p] ?? emptyCounts();
      // "pending" is derived, not stored: expected (existing tasks) minus rows with a
      // non-null (terminal) lastStatus for this provider (architecture §4).
      bucket.pending = Math.max(existingTaskCount - bucket.ok - bucket.failed, 0);
      byProvider[p] = bucket;
    }
  }

  const totals = Object.values(byProvider).reduce<ProviderCounts>(
    (acc, cur) => ({
      ok: acc.ok + cur.ok,
      failed: acc.failed + cur.failed,
      pending: acc.pending + cur.pending,
    }),
    emptyCounts(),
  );

  const failingLinks = await prisma.syncLink.findMany({
    where: {
      lastStatus: "failed",
      taskId: { in: existingTaskCount > 0 ? existingTaskIds : [] },
      ...(provider ? { provider } : {}),
    },
    take: FAILING_LIST_PAGE_SIZE,
  });

  const failing: FailingTaskSummary[] = failingLinks.map((link) => ({
    taskId: link.taskId,
    provider: link.provider,
    lastError: link.lastError,
  }));

  return { counts: totals, byProvider, failing };
}

/**
 * Returns the current sync-health snapshot, optionally filtered to one provider. Backed by a
 * process-local TTL cache keyed by the provider filter — a few seconds of staleness on a
 * health/status endpoint is an accepted trade-off (documented in docs/MDP-7/04-impl-plan.md M7).
 */
export async function getSyncHealth(
  provider?: SyncProvider,
): Promise<SyncHealthResult> {
  const key = cacheKey(provider);
  const cached = cache.get(key);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await computeSyncHealth(provider);
  cache.set(key, { value, expiresAt: now + SYNC_HEALTH_CACHE_TTL_MS });
  return value;
}
