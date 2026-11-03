import { TASK_STATUSES, TASK_STATUS_LABELS } from '../types';
import type { TaskListItem, TaskStatus } from '../types';
import { SyncBadgeRow } from './SyncBadgeRow';

interface Props {
  tasks: TaskListItem[];
  onEdit: (task: TaskListItem) => void;
  onDelete: (task: TaskListItem) => void;
  onSelectSync: (task: TaskListItem) => void;
}

/** T-2: task board with one column per status. */
export function TaskBoard({ tasks, onEdit, onDelete, onSelectSync }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      {TASK_STATUSES.map((status) => (
        <TaskColumn
          key={status}
          status={status}
          tasks={tasks.filter((t) => t.status === status)}
          onEdit={onEdit}
          onDelete={onDelete}
          onSelectSync={onSelectSync}
        />
      ))}
    </div>
  );
}

function TaskColumn({
  status,
  tasks,
  onEdit,
  onDelete,
  onSelectSync,
}: { status: TaskStatus; tasks: TaskListItem[] } & Omit<Props, 'tasks'>) {
  return (
    <div className="bg-gray-50 rounded-lg p-3 min-h-[200px]">
      <h3 className="font-semibold text-sm text-gray-700 mb-2">
        {TASK_STATUS_LABELS[status]} ({tasks.length})
      </h3>
      <div className="space-y-2">
        {tasks.map((task) => (
          <div key={task.id} className="bg-white rounded shadow-sm p-3 border">
            <div className="flex justify-between items-start gap-2">
              <h4 className="font-medium text-sm">{task.title}</h4>
              <span className="text-xs text-gray-500 whitespace-nowrap">{task.priority}</span>
            </div>
            {task.description && (
              <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
            )}
            <div className="text-xs text-gray-500 mt-1">
              {task.assignee ? `Assignee: ${task.assignee}` : 'Unassigned'}
            </div>
            {task.labels.length > 0 && (
              <div className="flex gap-1 flex-wrap mt-1">
                {task.labels.map((label) => (
                  <span key={label} className="text-xs bg-gray-100 border rounded px-1">
                    {label}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2">
              <SyncBadgeRow summary={task.syncStatus} onSelect={() => onSelectSync(task)} />
            </div>
            <div className="flex gap-3 mt-2 text-xs">
              <button onClick={() => onEdit(task)} className="text-blue-600 underline">
                Edit
              </button>
              <button onClick={() => onDelete(task)} className="text-red-600 underline">
                Delete
              </button>
            </div>
          </div>
        ))}
        {tasks.length === 0 && <p className="text-xs text-gray-400">No tasks</p>}
      </div>
    </div>
  );
}
