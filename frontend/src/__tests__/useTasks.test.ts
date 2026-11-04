import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";

const listTasksMock = vi.fn();
vi.mock("../api/tasks", () => ({
  listTasks: (...args: unknown[]) => listTasksMock(...args),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

import { useTasks } from "../hooks/useTasks";

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

beforeEach(() => {
  listTasksMock.mockReset();
});

describe("useTasks", () => {
  it("fetches tasks with the given filters and exposes the result", async () => {
    listTasksMock.mockResolvedValue({ tasks: [], total: 0, limit: 50, offset: 0 });

    const { result } = renderHook(() => useTasks({ limit: 50, offset: 0 }), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listTasksMock).toHaveBeenCalledWith({ limit: 50, offset: 0 });
    expect(result.current.data?.tasks).toEqual([]);
  });

  it("surfaces an error state when the API call fails", async () => {
    listTasksMock.mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useTasks({}), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
