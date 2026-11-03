import { useEffect, useState } from 'react';
import { fetchTask } from '../api/client';
import type { TaskDetail } from '../types';

interface Props {
  taskId: string;
  onClose: () => void;
}

/**
 * T-6 detail view: shown when a user clicks a sync badge. Sourced from
 * GET /api/tasks/:id's full syncLinks[] — shows last_error and a link to
 * the external issue when one is recorded, per
 * phase-02-architecture.md REST API Surface.
 */
export function TaskSyncDetailModal({ taskId, onClose }: Props) {
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(null);
    fetchTask(taskId)
      .then((d) => {
        if (active) setDetail(d);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load sync detail');
      });
    return () => {
      active = false;
    };
  }, [taskId]);

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-lg p-4 w-full max-w-md max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-3">
          <h2 className="font-semibold">Sync status{detail ? ` — ${detail.title}` : ''}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-800" aria-label="Close">
            &times;
          </button>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {!detail && !error && <p className="text-sm text-gray-500">Loading...</p>}

        {detail && (
          <ul className="space-y-3">
            {detail.syncLinks.length === 0 && (
              <li className="text-sm text-gray-500">
                No sync result yet for either provider — sync is pending.
              </li>
            )}
            {detail.syncLinks.map((link) => (
              <li key={link.provider} className="border rounded p-2 text-sm">
                <div className="font-medium capitalize">{link.provider}</div>
                <div>Status: {link.lastStatus === 'ok' ? 'synced' : link.lastStatus ?? 'pending'}</div>
                {link.lastSyncedAt && (
                  <div className="text-gray-500">
                    Last attempt: {new Date(link.lastSyncedAt).toLocaleString()}
                  </div>
                )}
                {link.lastStatus === 'failed' && link.lastError && (
                  <div className="text-red-600 mt-1">Error: {link.lastError}</div>
                )}
                {link.externalKeyOrUrl && (
                  <a
                    className="text-blue-600 underline inline-block mt-1"
                    href={
                      link.externalKeyOrUrl.startsWith('http')
                        ? link.externalKeyOrUrl
                        : `#${link.externalKeyOrUrl}`
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    View external issue ({link.externalKeyOrUrl})
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
