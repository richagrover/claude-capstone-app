import type { SyncResult } from "../types/task";

const STATUS_LABEL: Record<SyncResult, string> = {
  ok: "Synced",
  failed: "Sync failed",
  pending: "Sync pending",
};

const STATUS_COLOR: Record<SyncResult, string> = {
  ok: "#1a7f37",
  failed: "#cf222e",
  pending: "#9a6700",
};

export interface SyncStatusBadgeProps {
  provider: string;
  status: SyncResult;
}

/** Small per-provider sync badge rendered on a task card/list row. */
export function SyncStatusBadge({ provider, status }: SyncStatusBadgeProps) {
  return (
    <span
      data-testid={`sync-status-${provider}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 12,
        padding: "2px 8px",
        borderRadius: 12,
        border: `1px solid ${STATUS_COLOR[status]}`,
        color: STATUS_COLOR[status],
      }}
    >
      {provider}: {STATUS_LABEL[status]}
    </span>
  );
}
