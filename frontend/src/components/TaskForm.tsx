import { useState } from 'react';
import type { FormEvent } from 'react';
import { TASK_PRIORITIES, TASK_STATUSES, TASK_STATUS_LABELS } from '../types';
import type { Task, TaskPayload, TaskPriority, TaskStatus } from '../types';

export interface TaskFormData {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  assignee: string;
  dueDate: string;
  labels: string;
}

interface Props {
  initial?: Partial<Task>;
  onSubmit: (data: TaskFormData) => Promise<void> | void;
  onCancel: () => void;
  submitLabel?: string;
}

function toFormData(task?: Partial<Task>): TaskFormData {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    status: (task?.status as TaskStatus | undefined) ?? 'Backlog',
    priority: (task?.priority as TaskPriority | undefined) ?? 'Medium',
    assignee: task?.assignee ?? '',
    dueDate: task?.dueDate ? task.dueDate.slice(0, 10) : '',
    labels: task?.labels?.join(', ') ?? '',
  };
}

/** Converts form state into the API's TaskPayload shape (T-1 Data Model). */
export function formToPayload(form: TaskFormData): TaskPayload {
  return {
    title: form.title.trim(),
    description: form.description.trim() ? form.description.trim() : null,
    status: form.status,
    priority: form.priority,
    assignee: form.assignee.trim() ? form.assignee.trim() : null,
    dueDate: form.dueDate ? form.dueDate : null,
    labels: form.labels
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean),
  };
}

/** T-2: create/edit task form, fields match the data model exactly. */
export function TaskForm({ initial, onSubmit, onCancel, submitLabel = 'Save' }: Props) {
  const [form, setForm] = useState<TaskFormData>(toFormData(initial));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save task');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <label className="block text-sm">
        <span className="block text-gray-600">Title</span>
        <input
          required
          className="block w-full border rounded px-2 py-1 mt-1"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>

      <label className="block text-sm">
        <span className="block text-gray-600">Description</span>
        <textarea
          className="block w-full border rounded px-2 py-1 mt-1"
          rows={3}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </label>

      <div className="flex gap-3">
        <label className="block text-sm flex-1">
          <span className="block text-gray-600">Status</span>
          <select
            className="block w-full border rounded px-2 py-1 mt-1"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value as TaskStatus })}
          >
            {TASK_STATUSES.map((s) => (
              <option key={s} value={s}>
                {TASK_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm flex-1">
          <span className="block text-gray-600">Priority</span>
          <select
            className="block w-full border rounded px-2 py-1 mt-1"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value as TaskPriority })}
          >
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex gap-3">
        <label className="block text-sm flex-1">
          <span className="block text-gray-600">Assignee</span>
          <input
            className="block w-full border rounded px-2 py-1 mt-1"
            value={form.assignee}
            onChange={(e) => setForm({ ...form, assignee: e.target.value })}
            placeholder="user id"
          />
        </label>

        <label className="block text-sm flex-1">
          <span className="block text-gray-600">Due date</span>
          <input
            type="date"
            className="block w-full border rounded px-2 py-1 mt-1"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          />
        </label>
      </div>

      <label className="block text-sm">
        <span className="block text-gray-600">Labels (comma-separated)</span>
        <input
          className="block w-full border rounded px-2 py-1 mt-1"
          value={form.labels}
          onChange={(e) => setForm({ ...form, labels: e.target.value })}
          placeholder="backend, urgent"
        />
      </label>

      <div className="flex gap-2 justify-end pt-2">
        <button type="button" onClick={onCancel} className="px-3 py-1 rounded border text-sm">
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          {submitting ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
