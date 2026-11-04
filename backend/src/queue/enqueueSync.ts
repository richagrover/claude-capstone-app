/**
 * Enqueue helper used by taskService. Never awaited by an HTTP request handler (architecture
 * §2, §6 step 2) — task CRUD is synchronous; sync is asynchronous.
 *
 * Only enqueues onto a provider's queue when that provider is configured (env vars present),
 * per architecture §6 step 6 "partial provider configuration" — an unconfigured provider is
 * simply skipped here rather than enqueuing a job no worker will ever pick up.
 */
import { getGithubQueue, getJiraQueue } from "./queues";
import type { SyncJobPayload, SyncOperation, TaskSnapshot } from "./types";
import type { SyncProvider } from "@prisma/client";

function isGithubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}

function isJiraConfigured(): boolean {
  return Boolean(
    process.env.JIRA_API_TOKEN &&
      process.env.JIRA_BASE_URL &&
      process.env.JIRA_PROJECT_KEY,
  );
}

function configuredProviders(): SyncProvider[] {
  const providers: SyncProvider[] = [];
  if (isGithubConfigured()) providers.push("github");
  if (isJiraConfigured()) providers.push("jira");
  return providers;
}

/**
 * Enqueues a sync job for every currently-configured provider. Fire-and-forget: errors from the
 * enqueue call itself (e.g. Redis unreachable) are logged, never thrown back into the request
 * path, since the task mutation has already committed to Postgres.
 */
export function enqueueSyncForAllProviders(
  taskId: string,
  operation: SyncOperation,
  snapshot: TaskSnapshot,
): void {
  for (const provider of configuredProviders()) {
    const payload: SyncJobPayload = { taskId, provider, operation, snapshot };
    const queue = provider === "github" ? getGithubQueue() : getJiraQueue();
    queue.add(operation, payload).catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error(`Failed to enqueue ${operation} job for ${provider}:`, error);
    });
  }
}

export { configuredProviders };
