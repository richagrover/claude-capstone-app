// The seam a real Jira/GitHub client plugs into later (T-4/T-5 — currently
// blocked_on_config, out of scope for this dev pass). The worker (workers.ts)
// only ever talks to this interface, never to a concrete HTTP client
// directly, so swapping in the real integrations is a drop-in change.

export interface TaskSyncPayload {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee: string | null;
  labels: string[];
  dueDate: Date | null;
}

export type ProviderCallResult =
  | { ok: true; externalKeyOrUrl: string }
  | { ok: false; error: string };

export interface SyncProviderClient {
  /** No existing SyncLink for this provider — create a new external issue. */
  createIssue(task: TaskSyncPayload): Promise<ProviderCallResult>;
  /** Existing SyncLink — update the issue's mapped fields. */
  updateIssue(task: TaskSyncPayload, externalKeyOrUrl: string): Promise<ProviderCallResult>;
  /** Task deleted app-side — close (never delete) the linked external issue. */
  closeIssue(externalKeyOrUrl: string): Promise<ProviderCallResult>;
}
