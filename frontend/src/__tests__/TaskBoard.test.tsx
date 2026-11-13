import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { Task } from "../types/task";

const listTasksMock = vi.fn();
const createTaskMock = vi.fn();
const updateTaskMock = vi.fn();
const deleteTaskMock = vi.fn();

vi.mock("../api/tasks", () => ({
  listTasks: (...args: unknown[]) => listTasksMock(...args),
  createTask: (...args: unknown[]) => createTaskMock(...args),
  updateTask: (...args: unknown[]) => updateTaskMock(...args),
  deleteTask: (...args: unknown[]) => deleteTaskMock(...args),
}));

import { TaskBoard } from "../components/TaskBoard";

const SAMPLE_TASK: Task = {
  id: "123e4567-e89b-42d3-a456-556642440000",
  title: "Fix the bug",
  description: null,
  status: "Backlog",
  priority: "Medium",
  assignee: null,
  dueDate: null,
  labels: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  syncStatus: [{ provider: "github", status: "ok" }],
};

function renderWithQueryClient(ui: ReactNode) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  listTasksMock.mockReset();
  createTaskMock.mockReset();
  updateTaskMock.mockReset();
  deleteTaskMock.mockReset();
});

describe("TaskBoard", () => {
  it("renders tasks grouped into their status column", async () => {
    listTasksMock.mockResolvedValue({ tasks: [SAMPLE_TASK], total: 1, limit: 20, offset: 0 });

    renderWithQueryClient(<TaskBoard />);

    await waitFor(() => expect(screen.getByTestId(`task-card-${SAMPLE_TASK.id}`)).toBeInTheDocument());
    expect(screen.getByText("Fix the bug")).toBeInTheDocument();
    expect(screen.getByTestId("sync-status-github")).toBeInTheDocument();
  });

  it("renders an error message when the task list fails to load", async () => {
    listTasksMock.mockRejectedValue(new Error("network error"));

    renderWithQueryClient(<TaskBoard />);

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("renders pagination summary text", async () => {
    listTasksMock.mockResolvedValue({ tasks: [SAMPLE_TASK], total: 5, limit: 20, offset: 0 });

    renderWithQueryClient(<TaskBoard />);

    await waitFor(() => expect(screen.getByText(/of 5/)).toBeInTheDocument());
  });
});
