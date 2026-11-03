import { useEffect, useState } from 'react';
import { fetchSyncHealth } from '../api/client';
import type { SyncHealth } from '../types';

/** T-8: sync-health dashboard, consuming GET /api/sync-health. */
export function SyncHealthPage() {
  const [health, setHealth] = useState<SyncHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setHealth(await fetchSyncHealth());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sync health');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // Lightweight auto-refresh so the dashboard reflects worker progress
    // without requiring a manual reload.
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Sync Health</h1>
        <button onClick={load} className="text-sm text-blue-600 underline">
          Refresh
        </button>
      </div>

      {loading && <p className="text-sm text-gray-500">Loading...</p>}
      {error && <p className="text-red-600 text-sm">{error}</p>}

      {health && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <StatCard label="Synced" value={health.counts.synced} color="text-green-700" />
            <StatCard label="Pending" value={health.counts.pending} color="text-yellow-700" />
            <StatCard label="Failed" value={health.counts.failed} color="text-red-700" />
          </div>

          <h2 className="font-semibold mb-2">Currently failing syncs</h2>
          {health.failing.length === 0 ? (
            <p className="text-sm text-gray-500">No failing syncs.</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left border-b">
                  <th className="py-1 pr-2">Task ID</th>
                  <th className="py-1 pr-2">Provider</th>
                  <th className="py-1 pr-2">Last error</th>
                  <th className="py-1 pr-2">Last attempt</th>
                  <th className="py-1">External issue</th>
                </tr>
              </thead>
              <tbody>
                {health.failing.map((f, idx) => (
                  <tr key={`${f.taskId}-${f.provider}-${idx}`} className="border-b align-top">
                    <td className="py-1 pr-2 font-mono text-xs">{f.taskId}</td>
                    <td className="py-1 pr-2 capitalize">{f.provider}</td>
                    <td className="py-1 pr-2 text-red-600">{f.lastError}</td>
                    <td className="py-1 pr-2">
                      {f.lastSyncedAt ? new Date(f.lastSyncedAt).toLocaleString() : '—'}
                    </td>
                    <td className="py-1">
                      {f.externalKeyOrUrl ? (
                        <a
                          className="text-blue-600 underline"
                          href={f.externalKeyOrUrl.startsWith('http') ? f.externalKeyOrUrl : `#${f.externalKeyOrUrl}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {f.externalKeyOrUrl}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="border rounded-lg p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}
