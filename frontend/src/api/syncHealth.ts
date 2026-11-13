import { apiRequest } from "./client";
import type { SyncHealthResponse, SyncProvider } from "../types/task";

export function getSyncHealth(provider?: SyncProvider): Promise<SyncHealthResponse> {
  return apiRequest<SyncHealthResponse>("/sync-health", {
    method: "GET",
    query: { provider },
  });
}
