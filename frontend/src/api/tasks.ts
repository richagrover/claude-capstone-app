import { apiRequest } from "./client";
import type {
  CreateTaskInput,
  Task,
  TaskDetail,
  TaskFilters,
  TaskListResponse,
  UpdateTaskInput,
} from "../types/task";

export function listTasks(filters: TaskFilters = {}): Promise<TaskListResponse> {
  return apiRequest<TaskListResponse>("/tasks", {
    method: "GET",
    query: {
      status: filters.status,
      assignee: filters.assignee,
      priority: filters.priority,
      limit: filters.limit,
      offset: filters.offset,
    },
  });
}

export function getTask(id: string): Promise<TaskDetail> {
  return apiRequest<TaskDetail>(`/tasks/${id}`, { method: "GET" });
}

export function createTask(input: CreateTaskInput): Promise<Task> {
  return apiRequest<Task>("/tasks", { method: "POST", body: input });
}

export function updateTask(id: string, patch: UpdateTaskInput): Promise<Task> {
  return apiRequest<Task>(`/tasks/${id}`, { method: "PATCH", body: patch });
}

export function deleteTask(id: string): Promise<void> {
  return apiRequest<void>(`/tasks/${id}`, { method: "DELETE" });
}
