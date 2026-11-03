import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoardPage } from '../pages/BoardPage';
import type { TaskListItem } from '../types';

vi.mock('../api/client', () => ({
  fetchTasks: vi.fn(),
  fetchTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

import { fetchTasks } from '../api/client';

function makeTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: 't1',
    title: 'Ship feature',
    description: null,
    status: 'Backlog',
    priority: 'Medium',
    assignee: 'alice',
    dueDate: null,
    labels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    syncStatus: [
      { provider: 'jira', status: 'synced' },
      { provider: 'github', status: 'pending' },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** T-2: board renders tasks; filter changes trigger a refetch via state, not a page reload. */
describe('BoardPage', () => {
  it('fetches and renders tasks on mount', async () => {
    (fetchTasks as ReturnType<typeof vi.fn>).mockResolvedValue({
      tasks: [makeTask({ id: 't1', title: 'Initial task' })],
    });

    render(<BoardPage />);

    await waitFor(() => {
      expect(screen.getByText('Initial task')).toBeInTheDocument();
    });
    expect(fetchTasks).toHaveBeenCalledTimes(1);
    expect(fetchTasks).toHaveBeenCalledWith({});
  });

  it('refetches with the new filter when the status filter changes, without reloading the page', async () => {
    (fetchTasks as ReturnType<typeof vi.fn>).mockResolvedValue({
      tasks: [makeTask({ id: 't1', title: 'Initial task' })],
    });

    const beforeUnloadSpy = vi.fn();
    window.addEventListener('beforeunload', beforeUnloadSpy);
    const hrefBefore = window.location.href;

    render(<BoardPage />);
    await waitFor(() => expect(fetchTasks).toHaveBeenCalledTimes(1));

    (fetchTasks as ReturnType<typeof vi.fn>).mockResolvedValue({
      tasks: [makeTask({ id: 't2', title: 'In progress task', status: 'InProgress' })],
    });

    await userEvent.selectOptions(screen.getByLabelText(/status/i), 'InProgress');

    await waitFor(() => {
      expect(screen.getByText('In progress task')).toBeInTheDocument();
    });

    // Second, filtered fetch happened — but no full navigation/reload.
    expect(fetchTasks).toHaveBeenCalledTimes(2);
    expect(fetchTasks).toHaveBeenLastCalledWith({ status: 'InProgress' });
    // A real navigation/reload would fire beforeunload and change location;
    // this purely-controlled filter-driven refetch does neither.
    expect(beforeUnloadSpy).not.toHaveBeenCalled();
    expect(window.location.href).toBe(hrefBefore);
    // The previous task is gone from the DOM, but the component tree (and
    // its surrounding nav/page shell) was never torn down and remounted —
    // a true page reload would clear document.title/history, neither of
    // which this filter interaction touches.
    expect(screen.queryByText('Initial task')).not.toBeInTheDocument();

    window.removeEventListener('beforeunload', beforeUnloadSpy);
  });

  it('surfaces a fetch error instead of leaving a blank/stuck board', async () => {
    (fetchTasks as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('backend unreachable'));

    render(<BoardPage />);

    await waitFor(() => {
      expect(screen.getByText(/backend unreachable/i)).toBeInTheDocument();
    });
  });
});
