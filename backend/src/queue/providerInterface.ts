import type { TaskSnapshot } from "./types";

/**
 * Shared interface every sync provider adapter implements (architecture §2: "provider adapters
 * implement one shared interface so worker code never depends on a concrete provider SDK").
 */
export interface SyncProviderClient {
  createIssue(snapshot: TaskSnapshot): Promise<{ externalKeyOrUrl: string }>;
  updateIssue(externalKeyOrUrl: string, snapshot: TaskSnapshot): Promise<void>;
  closeIssue(externalKeyOrUrl: string): Promise<void>;
}
