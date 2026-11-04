import { useState, type FormEvent } from "react";
import type { CreateTaskInput, Task, TaskPriority, TaskStatus } from "../types/task";

/**
 * Client-side mirrors of the backend's M3 field caps, for immediate feedback only — the server
 * remains the source of truth (docs/MDP-7/04-impl-plan.md M11.4).
 */
const TITLE_MAX_LENGTH = 200;
const DESCRIPTION_MAX_LENGTH = 5000;
const ASSIGNEE_MAX_LENGTH = 200;

const STATUS_OPTIONS: TaskStatus[] = ["Backlog", "InProgress", "InReview", "Done"];
const PRIORITY_OPTIONS: TaskPriority[] = ["Low", "Medium", "High"];

export interface TaskFormProps {
  initialTask?: Task;
  onSubmit: (input: CreateTaskInput) => void;
  onCancel: () => void;
}

export function TaskForm({ initialTask, onSubmit, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(initialTask?.title ?? "");
  const [description, setDescription] = useState(initialTask?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(initialTask?.status ?? "Backlog");
  const [priority, setPriority] = useState<TaskPriority>(initialTask?.priority ?? "Medium");
  const [assignee, setAssignee] = useState(initialTask?.assignee ?? "");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();

    if (trimmedTitle.length === 0 || trimmedTitle.length > TITLE_MAX_LENGTH) {
      setError(`Title must be between 1 and ${TITLE_MAX_LENGTH} characters.`);
      return;
    }
    if (description.length > DESCRIPTION_MAX_LENGTH) {
      setError(`Description must be at most ${DESCRIPTION_MAX_LENGTH} characters.`);
      return;
    }
    if (assignee.length > ASSIGNEE_MAX_LENGTH) {
      setError(`Assignee must be at most ${ASSIGNEE_MAX_LENGTH} characters.`);
      return;
    }

    setError(null);
    onSubmit({
      title: trimmedTitle,
      description: description || undefined,
      status,
      priority,
      assignee: assignee || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} data-testid="task-form">
      {error ? <p role="alert">{error}</p> : null}

      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>

      <label>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <label>
        Status
        <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
          {STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        Priority
        <select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
          {PRIORITY_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>

      <label>
        Assignee
        <input value={assignee} onChange={(e) => setAssignee(e.target.value)} />
      </label>

      <div className="task-form-actions">
        <button type="submit">Save</button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
