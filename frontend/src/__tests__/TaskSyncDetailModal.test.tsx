import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { TaskSyncDetailModal } from '../components/TaskSyncDetailModal';
import type { TaskDetail } from '../types';

vi.mock('../api/client', () => ({
  fetchTask: vi.fn(),
}));

import { fetchTask } from '../api/client';

/** T-6: clicking a sync badge opens the detail modal with last_error. */
describe('TaskSyncDetailModal', () => {
  it('shows last_error for a failed provider once the detail loads', async () => {
    const detail: TaskDetail = {
      id: 'task-1',
      title: 'Flaky sync task',
      description: null,
      status: 'Backlog',
      priority: 'Medium',
      assignee: null,
      dueDate: null,
      labels: [],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      syncLinks: [
        {
          provider: 'jira',
          externalKeyOrUrl: null,
          lastSyncedAt: '2026-01-02T00:00:00.000Z',
          lastStatus: 'failed',
          lastError: 'JIRA_PROJECT_KEY is not configured',
        },
      ],
    };
    (fetchTask as ReturnType<typeof vi.fn>).mockResolvedValue(detail);

    render(<TaskSyncDetailModal taskId="task-1" onClose={() => {}} />);

    expect(screen.getByText(/loading/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/JIRA_PROJECT_KEY is not configured/)).toBeInTheDocument();
    });

    expect(screen.getByText(/Flaky sync task/)).toBeInTheDocument();
    expect(fetchTask).toHaveBeenCalledWith('task-1');
  });

  it('surfaces a fetch error instead of hanging silently', async () => {
    (fetchTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    render(<TaskSyncDetailModal taskId="task-2" onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/network down/i)).toBeInTheDocument();
    });
  });
});
