/** Per-provider queue name constants — avoids magic strings scattered across queue/worker code. */
export const QUEUE_NAMES = {
  github: "sync-github",
  jira: "sync-jira",
} as const;

export type QueueProviderKey = keyof typeof QUEUE_NAMES;
