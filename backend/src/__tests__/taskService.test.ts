import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock(...) factories are hoisted above the rest of this module, so any variable they
// close over must be created inside vi.hoisted() — otherwise it is accessed in its TDZ
// (ReferenceError: "Cannot access '<name>' before initialization").
const { mockPrisma, enqueueSyncForAllProviders } = vi.hoisted(() => ({
  mockPrisma: {
    task: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    syncLink: {
      findMany: vi.fn(),
    },
  },
  enqueueSyncForAllProviders: vi.fn(),
}));

vi.mock("../db", () => ({ prisma: mockPrisma }));

vi.mock("../queue/enqueueSync", () => ({
  enqueueSyncForAllProviders: (...args: unknown[]) =>
    enqueueSyncForAllProviders(...args),
}));

// Imported after the mocks above are registered.
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from "../services/taskService";

const SAMPLE_TASK = {
  id: "123e4567-e89b-42d3-a456-556642440000",
  title: "Fix the bug",
  description: null,
  status: "Backlog",
  priority: "Medium",
  assignee: null,
  dueDate: null,
  labels: [],
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listTasks", () => {
  it("returns tasks with derived syncStatus and clamps pagination", async () => {
    mockPrisma.task.findMany.mockResolvedValue([SAMPLE_TASK]);
    mockPrisma.task.count.mockResolvedValue(1);
    mockPrisma.syncLink.findMany.mockResolvedValue([
      { taskId: SAMPLE_TASK.id, provider: "github", lastStatus: "ok" },
    ]);

    const result = await listTasks({ limit: 500, offset: -10 });

    expect(mockPrisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 200, skip: 0 }),
    );
    expect(result.tasks[0].syncStatus).toEqual([{ provider: "github", status: "ok" }]);
    expect(result.total).toBe(1);
  });

  it("returns an empty tasks array when there are no matches", async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.task.count.mockResolvedValue(0);

    const result = await listTasks({});
    expect(result.tasks).toEqual([]);
    expect(mockPrisma.syncLink.findMany).not.toHaveBeenCalled();
  });

  it("marks a link with a null lastStatus as pending", async () => {
    mockPrisma.task.findMany.mockResolvedValue([SAMPLE_TASK]);
    mockPrisma.task.count.mockResolvedValue(1);
    mockPrisma.syncLink.findMany.mockResolvedValue([
      { taskId: SAMPLE_TASK.id, provider: "jira", lastStatus: null },
    ]);

    const result = await listTasks({});
    expect(result.tasks[0].syncStatus).toEqual([{ provider: "jira", status: "pending" }]);
  });
});

describe("getTask", () => {
  it("returns null when the task does not exist", async () => {
    mockPrisma.task.findUnique.mockResolvedValue(null);
    const result = await getTask(SAMPLE_TASK.id);
    expect(result).toBeNull();
  });

  it("returns the task with its full syncLinks projection", async () => {
    mockPrisma.task.findUnique.mockResolvedValue(SAMPLE_TASK);
    mockPrisma.syncLink.findMany.mockResolvedValue([
      {
        provider: "github",
        externalKeyOrUrl: "https://github.com/org/repo/issues/1",
        lastSyncedAt: new Date(),
        lastStatus: "ok",
        lastError: null,
      },
    ]);

    const result = await getTask(SAMPLE_TASK.id);
    expect(result?.syncLinks).toHaveLength(1);
    expect(result?.syncLinks[0].provider).toBe("github");
  });
});

describe("createTask", () => {
  it("creates a task and enqueues a create sync job for every configured provider", async () => {
    mockPrisma.task.create.mockResolvedValue(SAMPLE_TASK);

    const result = await createTask({ title: "Fix the bug" });

    expect(mockPrisma.task.create).toHaveBeenCalled();
    expect(enqueueSyncForAllProviders).toHaveBeenCalledWith(
      SAMPLE_TASK.id,
      "create",
      expect.objectContaining({ title: "Fix the bug" }),
    );
    expect(result).toEqual(SAMPLE_TASK);
  });
});

describe("updateTask", () => {
  it("returns null when the task does not exist", async () => {
    mockPrisma.task.findUnique.mockResolvedValue(null);
    const result = await updateTask(SAMPLE_TASK.id, { title: "New title" });
    expect(result).toBeNull();
    expect(enqueueSyncForAllProviders).not.toHaveBeenCalled();
  });

  it("enqueues an update job when a sync-relevant field changes", async () => {
    mockPrisma.task.findUnique.mockResolvedValue(SAMPLE_TASK);
    mockPrisma.task.update.mockResolvedValue({ ...SAMPLE_TASK, status: "InProgress" });

    await updateTask(SAMPLE_TASK.id, { status: "InProgress" as never });

    expect(enqueueSyncForAllProviders).toHaveBeenCalledWith(
      SAMPLE_TASK.id,
      "update",
      expect.objectContaining({ status: "InProgress" }),
    );
  });

  it("does not enqueue a sync job when no sync-relevant field changes", async () => {
    mockPrisma.task.findUnique.mockResolvedValue(SAMPLE_TASK);
    mockPrisma.task.update.mockResolvedValue(SAMPLE_TASK);

    await updateTask(SAMPLE_TASK.id, { dueDate: undefined });

    expect(enqueueSyncForAllProviders).not.toHaveBeenCalled();
  });
});

describe("deleteTask", () => {
  it("is idempotent: deleting a missing task does not throw or enqueue", async () => {
    mockPrisma.task.findUnique.mockResolvedValue(null);

    await expect(deleteTask(SAMPLE_TASK.id)).resolves.toBeUndefined();
    expect(mockPrisma.task.delete).not.toHaveBeenCalled();
    expect(enqueueSyncForAllProviders).not.toHaveBeenCalled();
  });

  it("deletes an existing task and enqueues a close job using a pre-delete snapshot", async () => {
    mockPrisma.task.findUnique.mockResolvedValue(SAMPLE_TASK);
    mockPrisma.task.delete.mockResolvedValue(SAMPLE_TASK);

    await deleteTask(SAMPLE_TASK.id);

    expect(mockPrisma.task.delete).toHaveBeenCalledWith({ where: { id: SAMPLE_TASK.id } });
    expect(enqueueSyncForAllProviders).toHaveBeenCalledWith(
      SAMPLE_TASK.id,
      "close",
      expect.objectContaining({ title: SAMPLE_TASK.title }),
    );
  });
});
