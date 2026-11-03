import type { ChangeEvent } from 'react';
import { TASK_PRIORITIES, TASK_STATUSES, TASK_STATUS_LABELS } from '../types';
import type { TaskFilters, TaskPriority, TaskStatus } from '../types';

interface Props {
  filters: TaskFilters;
  onChange: (filters: TaskFilters) => void;
}

/** T-2: filter by status/assignee/priority — onChange updates state, no page reload. */
export function FilterBar({ filters, onChange }: Props) {
  function handleStatus(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as TaskStatus | '';
    onChange({ ...filters, status: value === '' ? undefined : value });
  }

  function handlePriority(e: ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value as TaskPriority | '';
    onChange({ ...filters, priority: value === '' ? undefined : value });
  }

  function handleAssignee(e: ChangeEvent<HTMLInputElement>) {
    onChange({ ...filters, assignee: e.target.value || undefined });
  }

  const hasFilters = Boolean(filters.status || filters.priority || filters.assignee);

  return (
    <div className="flex flex-wrap gap-3 items-end mb-4">
      <label className="text-sm">
        <span className="block text-gray-600">Status</span>
        <select className="border rounded px-2 py-1 mt-1" value={filters.status ?? ''} onChange={handleStatus}>
          <option value="">All</option>
          {TASK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TASK_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="block text-gray-600">Priority</span>
        <select className="border rounded px-2 py-1 mt-1" value={filters.priority ?? ''} onChange={handlePriority}>
          <option value="">All</option>
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="block text-gray-600">Assignee</span>
        <input
          className="border rounded px-2 py-1 mt-1"
          value={filters.assignee ?? ''}
          onChange={handleAssignee}
          placeholder="user id"
        />
      </label>

      {hasFilters && (
        <button type="button" className="text-sm text-blue-600 underline" onClick={() => onChange({})}>
          Clear filters
        </button>
      )}
    </div>
  );
}
