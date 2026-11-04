import type { Task } from "../types/task";
import { SyncStatusBadge } from "./SyncStatusBadge";

export interface TaskCardProps {
  task: Task;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
}

export function TaskCard({ task, onEdit, onDelete }: TaskCardProps) {
  return (
    <div data-testid={`task-card-${task.id}`} className="task-card">
      <div className="task-card-header">
        <h4>{task.title}</h4>
        <span className="task-priority">{task.priority}</span>
      </div>
      {task.description ? <p className="task-description">{task.description}</p> : null}
      {task.assignee ? <p className="task-assignee">Assignee: {task.assignee}</p> : null}
      {task.labels.length > 0 ? (
        <ul className="task-labels">
          {task.labels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      ) : null}
      <div className="task-sync-statuses">
        {(task.syncStatus ?? []).map((sync) => (
          <SyncStatusBadge key={sync.provider} provider={sync.provider} status={sync.status} />
        ))}
      </div>
      <div className="task-card-actions">
        <button type="button" onClick={() => onEdit(task)}>
          Edit
        </button>
        <button type="button" onClick={() => onDelete(task.id)}>
          Delete
        </button>
      </div>
    </div>
  );
}
