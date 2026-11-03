import { useCallback, useEffect, useState } from 'react';
import { createTask, deleteTask, fetchTasks, updateTask } from '../api/client';
import { FilterBar } from '../components/FilterBar';
import { Modal } from '../components/Modal';
import { TaskBoard } from '../components/TaskBoard';
import { TaskForm, formToPayload } from '../components/TaskForm';
import type { TaskFormData } from '../components/TaskForm';
import { TaskSyncDetailModal } from '../components/TaskSyncDetailModal';
import type { TaskFilters, TaskListItem } from '../types';

/** T-2 board/list UI + T-6 sync badges, wired to T-1's REST API. */
export function BoardPage() {
  const [filters, setFilters] = useState<TaskFilters>({});
  const [tasks, setTasks] = useState<TaskListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<TaskListItem | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [syncDetailTaskId, setSyncDetailTaskId] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { tasks: fetched } = await fetchTasks(filters);
      setTasks(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  async function handleCreate(form: TaskFormData) {
    await createTask(formToPayload(form));
    setShowCreateForm(false);
    await loadTasks();
  }

  async function handleUpdate(form: TaskFormData) {
    if (!editingTask) return;
    await updateTask(editingTask.id, formToPayload(form));
    setEditingTask(null);
    await loadTasks();
  }

  async function handleDelete(task: TaskListItem) {
    const confirmed = window.confirm(
      `Delete "${task.title}"? Linked Jira/GitHub issues will be closed, not deleted.`
    );
    if (!confirmed) return;
    await deleteTask(task.id);
    await loadTasks();
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-xl font-bold">Task Board</h1>
        <button
          onClick={() => setShowCreateForm(true)}
          className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm"
        >
          + New Task
        </button>
      </div>

      <FilterBar filters={filters} onChange={setFilters} />

      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <TaskBoard
          tasks={tasks}
          onEdit={setEditingTask}
          onDelete={handleDelete}
          onSelectSync={(task) => setSyncDetailTaskId(task.id)}
        />
      )}

      {showCreateForm && (
        <Modal title="New Task" onClose={() => setShowCreateForm(false)}>
          <TaskForm onSubmit={handleCreate} onCancel={() => setShowCreateForm(false)} submitLabel="Create" />
        </Modal>
      )}

      {editingTask && (
        <Modal title="Edit Task" onClose={() => setEditingTask(null)}>
          <TaskForm
            initial={editingTask}
            onSubmit={handleUpdate}
            onCancel={() => setEditingTask(null)}
            submitLabel="Save"
          />
        </Modal>
      )}

      {syncDetailTaskId && (
        <TaskSyncDetailModal taskId={syncDetailTaskId} onClose={() => setSyncDetailTaskId(null)} />
      )}
    </div>
  );
}
