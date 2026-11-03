import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TaskBoard } from '../components/TaskBoard';
import type { TaskListItem } from '../types';

function makeTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: 't1',
    title: 'Ship feature',
    description: null,
    status: 'Backlog',
    priority: 'Medium',
    assignee: null,
    dueDate: null,
    labels: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    syncStatus: [
      { provider: 'jira', status: 'pending' },
      { provider: 'github', status: 'pending' },
    ],
    ...overrides,
  };
}

/** T-2: board renders tasks into the correct status column. */
describe('TaskBoard', () => {
  it('renders each task under its status column', () => {
    const tasks: TaskListItem[] = [
      makeTask({ id: 't1', title: 'Backlog task', status: 'Backlog' }),
      makeTask({ id: 't2', title: 'In progress task', status: 'InProgress' }),
      makeTask({ id: 't3', title: 'Done task', status: 'Done' }),
    ];

    render(<TaskBoard tasks={tasks} onEdit={vi.fn()} onDelete={vi.fn()} onSelectSync={vi.fn()} />);

    expect(screen.getByText('Backlog task')).toBeInTheDocument();
    expect(screen.getByText('In progress task')).toBeInTheDocument();
    expect(screen.getByText('Done task')).toBeInTheDocument();

    // Column headers include the per-column count.
    expect(screen.getByText('Backlog (1)')).toBeInTheDocument();
    expect(screen.getByText('In Progress (1)')).toBeInTheDocument();
    expect(screen.getByText('Done (1)')).toBeInTheDocument();
    expect(screen.getByText('In Review (0)')).toBeInTheDocument();
  });

  it('shows "No tasks" for an empty column', () => {
    render(<TaskBoard tasks={[]} onEdit={vi.fn()} onDelete={vi.fn()} onSelectSync={vi.fn()} />);
    expect(screen.getAllByText('No tasks')).toHaveLength(4);
  });

  it('invokes onSelectSync (via the sync badge) with the clicked task', async () => {
    const onSelectSync = vi.fn();
    const task = makeTask({
      id: 't1',
      title: 'Badge task',
      syncStatus: [{ provider: 'jira', status: 'failed' }, { provider: 'github', status: 'synced' }],
    });

    render(<TaskBoard tasks={[task]} onEdit={vi.fn()} onDelete={vi.fn()} onSelectSync={onSelectSync} />);

    await userEvent.click(screen.getByRole('button', { name: /jira: failed/i }));

    expect(onSelectSync).toHaveBeenCalledWith(task);
  });

  it('invokes onEdit/onDelete with the clicked task', async () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const task = makeTask({ id: 't1', title: 'Editable task' });

    render(<TaskBoard tasks={[task]} onEdit={onEdit} onDelete={onDelete} onSelectSync={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(onEdit).toHaveBeenCalledWith(task);

    await userEvent.click(screen.getByRole('button', { name: /delete/i }));
    expect(onDelete).toHaveBeenCalledWith(task);
  });
});
