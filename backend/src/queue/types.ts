import type { TaskSyncPayload } from './providerInterface';

export type SyncOperation = 'create' | 'update' | 'close';
export type SyncProviderName = 'jira' | 'github';

export interface SyncJobInput {
  taskId: string;
  operation: SyncOperation;
  /**
   * Snapshot of the task's mapped fields captured at enqueue time. Required
   * (rather than re-fetching by taskId when the job runs) because the
   * "close" job for a deleted task runs after the Task row is already gone
   * — see phase-02-architecture.md Data Model section.
   */
  snapshot: TaskSyncPayload;
}

export interface SyncJobData extends SyncJobInput {
  provider: SyncProviderName;
}
