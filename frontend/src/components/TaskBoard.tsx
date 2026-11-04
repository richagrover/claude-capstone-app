import { useMemo, useState } from "react";
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from "../hooks/useTasks";
import type { CreateTaskInput, Task, TaskPriority, TaskStatus } from "../types/task";
import { TaskCard } from "./TaskCard";
import { TaskForm } from "./TaskForm";

const BOARD_COLUMNS: TaskStatus[] = ["Backlog", "InProgress", "InReview", "Done"];
const PAGE_SIZE = 20;

export function TaskBoard() {
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | "">("");
  const [offset, setOffset] = useState(0);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const filters = useMemo(
    () => ({
      assignee: assigneeFilter || undefined,
      priority: priorityFilter || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
    [assigneeFilter, priorityFilter, offset],
  );

  const { data, isLoading, isError } = useTasks(filters);
  const createTaskMutation = useCreateTask();
  const updateTaskMutation = useUpdateTask();
  const deleteTaskMutation = useDeleteTask();

  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, Task[]> = {
      Backlog: [],
      InProgress: [],
      InReview: [],
      Done: [],
    };
    for (const task of data?.tasks ?? []) {
      grouped[task.status].push(task);
    }
    return grouped;
  }, [data]);

  function handleCreateOrUpdate(input: CreateTaskInput) {
    if (editingTask) {
      updateTaskMutation.mutate({ id: editingTask.id, patch: input });
      setEditingTask(null);
    } else {
      createTaskMutation.mutate(input);
      setIsCreating(false);
    }
  }

  if (isLoading) return <p>Loading tasks…</p>;
  if (isError) return <p role="alert">Failed to load tasks.</p>;

  return (
    <div data-testid="task-board">
      <div className="task-board-filters">
        <input
          placeholder="Filter by assignee"
          value={assigneeFilter}
          onChange={(e) => {
            setAssigneeFilter(e.target.value);
            setOffset(0);
          }}
        />
        <select
          value={priorityFilter}
          onChange={(e) => {
            setPriorityFilter(e.target.value as TaskPriority | "");
            setOffset(0);
          }}
        >
          <option value="">All priorities</option>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>
        <button type="button" onClick={() => setIsCreating(true)}>
          New Task
        </button>
      </div>

      {isCreating || editingTask ? (
        <TaskForm
          initialTask={editingTask ?? undefined}
          onSubmit={handleCreateOrUpdate}
          onCancel={() => {
            setIsCreating(false);
            setEditingTask(null);
          }}
        />
      ) : null}

      <div className="task-board-columns">
        {BOARD_COLUMNS.map((column) => (
          <div key={column} className="task-board-column" data-testid={`column-${column}`}>
            <h3>{column}</h3>
            {tasksByStatus[column].map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onEdit={setEditingTask}
                onDelete={(id) => deleteTaskMutation.mutate(id)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="task-board-pagination">
        <button
          type="button"
          disabled={offset === 0}
          onClick={() => setOffset((prev) => Math.max(prev - PAGE_SIZE, 0))}
        >
          Previous
        </button>
        <span>
          Showing {offset + 1}–{offset + (data?.tasks.length ?? 0)} of {data?.total ?? 0}
        </span>
        <button
          type="button"
          disabled={!data || offset + PAGE_SIZE >= data.total}
          onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
