/**
 * Worker factories (resolves G-1, B-3).
 *
 * - Concurrency: each provider Worker reads QUEUE_CONCURRENCY (default 1 — serial per lane),
 *   closing B-3 by making the behavior explicit/configurable rather than left undefined.
 * - Idempotency (G-1): the create-vs-update decision, the provider call, and the SyncLink
 *   upsert + SyncAttempt insert all happen inside one Postgres transaction guarded by a
 *   session-scoped advisory lock keyed on (taskId, provider). This makes the race safe even if
 *   QUEUE_CONCURRENCY is later raised above 1 — the fix does not depend solely on serial
 *   processing.
 * - On provider-call failure, the transaction still commits the failed SyncAttempt + SyncLink
 *   update (failure bookkeeping is never lost); BullMQ's own retry/backoff then reschedules the
 *   job up to its attempt cap.
 */
import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "./connection";
import { QUEUE_NAMES } from "./queueNames";
import type { SyncJobPayload } from "./types";
import type { SyncProviderClient } from "./providerInterface";
import { prisma } from "../db";

const DEFAULT_CONCURRENCY = 1;

export function getConfiguredConcurrency(): number {
  const raw = process.env.QUEUE_CONCURRENCY;
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_CONCURRENCY;
}

/** Deterministic lock key derivation: Postgres advisory locks take a single bigint. */
function advisoryLockKeyExpression(): string {
  return `hashtext($1 || ':' || $2)`;
}

/**
 * Processes a single sync job: acquires an advisory lock scoped to (taskId, provider) inside a
 * transaction, decides create-vs-update from the current SyncLink state, calls the provider
 * adapter, then upserts SyncLink and inserts a SyncAttempt row — all before the transaction
 * commits and releases the lock.
 */
export async function processSyncJob(
  payload: SyncJobPayload,
  provider: SyncProviderClient,
): Promise<void> {
  const { taskId, provider: providerName, operation, snapshot } = payload;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT pg_advisory_xact_lock(${advisoryLockKeyExpression()})`,
      taskId,
      providerName,
    );

    const existingLink = await tx.syncLink.findUnique({
      where: { taskId_provider: { taskId, provider: providerName } },
    });

    let result: "ok" | "failed" = "ok";
    let detail: string | null = null;
    let externalKeyOrUrl = existingLink?.externalKeyOrUrl ?? null;

    try {
      if (operation === "close") {
        if (externalKeyOrUrl) {
          await provider.closeIssue(externalKeyOrUrl);
          detail = externalKeyOrUrl;
        }
      } else if (!externalKeyOrUrl) {
        // No existing link for this provider yet → create, regardless of requested operation.
        const created = await provider.createIssue(snapshot);
        externalKeyOrUrl = created.externalKeyOrUrl;
        detail = externalKeyOrUrl;
      } else {
        await provider.updateIssue(externalKeyOrUrl, snapshot);
        detail = externalKeyOrUrl;
      }
    } catch (error) {
      result = "failed";
      detail = error instanceof Error ? error.message : "Unknown provider error";
    }

    await tx.syncLink.upsert({
      where: { taskId_provider: { taskId, provider: providerName } },
      create: {
        taskId,
        provider: providerName,
        externalKeyOrUrl,
        lastSyncedAt: new Date(),
        lastStatus: result,
        lastError: result === "failed" ? detail : null,
      },
      update: {
        externalKeyOrUrl,
        lastSyncedAt: new Date(),
        lastStatus: result,
        lastError: result === "failed" ? detail : null,
      },
    });

    await tx.syncAttempt.create({
      data: { taskId, provider: providerName, result, detail },
    });

    if (result === "failed") {
      // Propagate so BullMQ applies its retry/backoff policy; the failure bookkeeping above
      // has already been committed as part of this same transaction before we throw.
      throw new Error(detail ?? "Sync job failed");
    }
  });
}

/**
 * Creates a BullMQ Worker for one provider queue. Returns null (and logs once) if the provider
 * is not configured — architecture §6 step 6's "partial provider configuration" behavior.
 */
export function createProviderWorker(
  providerKey: "github" | "jira",
  provider: SyncProviderClient | null,
): Worker<SyncJobPayload> | null {
  if (!provider) {
    // eslint-disable-next-line no-console
    console.warn(
      `Sync worker for provider "${providerKey}" not started: required credentials are absent.`,
    );
    return null;
  }

  const queueName = QUEUE_NAMES[providerKey];
  return new Worker<SyncJobPayload>(
    queueName,
    async (job: Job<SyncJobPayload>) => {
      await processSyncJob(job.data, provider);
    },
    {
      connection: getRedisConnection(),
      concurrency: getConfiguredConcurrency(),
    },
  );
}
