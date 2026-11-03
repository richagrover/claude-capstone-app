import type { SyncStatusSummary } from '../types';

const STATUS_STYLES: Record<SyncStatusSummary['status'], string> = {
  synced: 'bg-green-100 text-green-800 border-green-300',
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  failed: 'bg-red-100 text-red-800 border-red-300',
};

const PROVIDER_LABELS: Record<SyncStatusSummary['provider'], string> = {
  jira: 'Jira',
  github: 'GitHub',
};

interface Props {
  summary: SyncStatusSummary[];
  onSelect?: (provider: SyncStatusSummary['provider']) => void;
}

/** Per-task sync badges (T-6) — sourced from the list endpoint's syncStatus[] summary. */
export function SyncBadgeRow({ summary, onSelect }: Props) {
  return (
    <div className="flex gap-1 flex-wrap">
      {summary.map((s) => (
        <button
          key={s.provider}
          type="button"
          onClick={() => onSelect?.(s.provider)}
          title={`${PROVIDER_LABELS[s.provider]}: ${s.status}`}
          className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_STYLES[s.status]}`}
        >
          {PROVIDER_LABELS[s.provider]}: {s.status}
        </button>
      ))}
    </div>
  );
}
