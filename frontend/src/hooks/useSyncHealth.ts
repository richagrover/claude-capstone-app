import { useQuery } from "@tanstack/react-query";
import { getSyncHealth } from "../api/syncHealth";
import type { SyncProvider } from "../types/task";

/**
 * Polling interval for the sync-health panel. Deliberately coarser than the backend's M7 TTL
 * cache (5s) so polling never defeats the cache (docs/MDP-7/04-impl-plan.md M12.1).
 */
export const SYNC_HEALTH_POLL_INTERVAL_MS = 15_000;

export function useSyncHealth(provider?: SyncProvider) {
  return useQuery({
    queryKey: ["sync-health", provider],
    queryFn: () => getSyncHealth(provider),
    refetchInterval: SYNC_HEALTH_POLL_INTERVAL_MS,
  });
}
