import { useSyncHealth } from "../hooks/useSyncHealth";

/** Renders counts, byProvider, and failing[] with lastError text (docs/MDP-7/04-impl-plan.md M12.2). */
export function SyncHealthPanel() {
  const { data, isLoading, isError } = useSyncHealth();

  if (isLoading) return <p>Loading sync health…</p>;
  if (isError || !data) return <p role="alert">Failed to load sync health.</p>;

  return (
    <section data-testid="sync-health-panel">
      <h3>Sync Health</h3>
      <dl className="sync-health-totals">
        <dt>Synced</dt>
        <dd>{data.counts.ok}</dd>
        <dt>Pending</dt>
        <dd>{data.counts.pending}</dd>
        <dt>Failed</dt>
        <dd>{data.counts.failed}</dd>
      </dl>

      <div className="sync-health-by-provider">
        {Object.entries(data.byProvider).map(([provider, counts]) => (
          <div key={provider} data-testid={`provider-counts-${provider}`}>
            <strong>{provider}</strong>: ok {counts.ok}, pending {counts.pending}, failed{" "}
            {counts.failed}
          </div>
        ))}
      </div>

      {data.failing.length > 0 ? (
        <div className="sync-health-failing">
          <h4>Failing Tasks</h4>
          <ul>
            {data.failing.map((item) => (
              <li key={`${item.taskId}-${item.provider}`}>
                {item.taskId} ({item.provider}): {item.lastError ?? "Unknown error"}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
