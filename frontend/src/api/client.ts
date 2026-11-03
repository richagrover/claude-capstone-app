import type {
  SyncHealth,
  Task,
  TaskDetail,
  TaskFilters,
  TaskListItem,
  TaskPayload,
} from '../types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed with status ${res.status}`);
  }
  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

export function fetchTasks(filters: TaskFilters): Promise<{ tasks: TaskListItem[] }> {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.assignee) params.set('assignee', filters.assignee);
  if (filters.priority) params.set('priority', filters.priority);
  const qs = params.toString();
  return request<{ tasks: TaskListItem[] }>(`/tasks${qs ? `?${qs}` : ''}`);
}

export function fetchTask(id: string): Promise<TaskDetail> {
  return request<TaskDetail>(`/tasks/${id}`);
}

export function createTask(payload: TaskPayload): Promise<Task> {
  return request<Task>('/tasks', { method: 'POST', body: JSON.stringify(payload) });
}

export function updateTask(id: string, payload: Partial<TaskPayload>): Promise<Task> {
  return request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export function deleteTask(id: string): Promise<void> {
  return request<void>(`/tasks/${id}`, { method: 'DELETE' });
}

export function fetchSyncHealth(): Promise<SyncHealth> {
  return request<SyncHealth>('/sync-health');
}
