import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

// vi.mock(...) factories are hoisted above the rest of this module, so any variable they
// close over must be created inside vi.hoisted() — otherwise it is accessed in its TDZ
// (ReferenceError: "Cannot access '<name>' before initialization").
const taskService = vi.hoisted(() => ({
  listTasks: vi.fn(),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));

vi.mock("../services/taskService", () => taskService);

// app.ts pulls in syncHealthService -> db/enqueueSync transitively; mock those too so this
// suite never touches a real database/Redis connection.
vi.mock("../services/syncHealthService", () => ({
  getSyncHealth: vi.fn().mockResolvedValue({ counts: {}, byProvider: {}, failing: [] }),
}));
vi.mock("../queue/enqueueSync", () => ({
  enqueueSyncForAllProviders: vi.fn(),
  configuredProviders: vi.fn().mockReturnValue([]),
}));

import { createApp } from "../app";

const VALID_ID = "123e4567-e89b-42d3-a456-556642440000";
const SAMPLE_TASK = {
  id: VALID_ID,
  title: "Fix the bug",
  status: "Backlog",
  priority: "Medium",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.FRONTEND_ORIGIN = "http://localhost:5173";
});

const app = createApp();

describe("GET /api/tasks", () => {
  it("returns 200 with the task list", async () => {
    taskService.listTasks.mockResolvedValue({
      tasks: [SAMPLE_TASK],
      total: 1,
      limit: 50,
      offset: 0,
    });

    const res = await request(app).get("/api/tasks");

    expect(res.status).toBe(200);
    expect(res.body.tasks).toHaveLength(1);
  });

  it("returns 400 for an invalid status filter", async () => {
    const res = await request(app).get("/api/tasks?status=NotAStatus");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_status");
  });

  it("clamps an oversized limit rather than rejecting the request", async () => {
    taskService.listTasks.mockResolvedValue({ tasks: [], total: 0, limit: 200, offset: 0 });

    const res = await request(app).get("/api/tasks?limit=10000");

    expect(res.status).toBe(200);
    expect(taskService.listTasks).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 200 }),
    );
  });
});

describe("POST /api/tasks", () => {
  it("returns 201 for a valid task", async () => {
    taskService.createTask.mockResolvedValue(SAMPLE_TASK);

    const res = await request(app).post("/api/tasks").send({ title: "Fix the bug" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(SAMPLE_TASK);
  });

  it("returns 400 for a missing title", async () => {
    const res = await request(app).post("/api/tasks").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_title");
  });

  it("returns 400 for an invalid enum value", async () => {
    const res = await request(app)
      .post("/api/tasks")
      .send({ title: "Fix it", priority: "Critical" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_priority");
  });
});

describe("GET /api/tasks/:id", () => {
  it("returns 200 when the task exists", async () => {
    taskService.getTask.mockResolvedValue({ ...SAMPLE_TASK, syncLinks: [] });

    const res = await request(app).get(`/api/tasks/${VALID_ID}`);
    expect(res.status).toBe(200);
  });

  it("returns 404 when the task does not exist", async () => {
    taskService.getTask.mockResolvedValue(null);

    const res = await request(app).get(`/api/tasks/${VALID_ID}`);
    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed id", async () => {
    const res = await request(app).get("/api/tasks/not-a-uuid");
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_id");
  });
});

describe("PATCH /api/tasks/:id", () => {
  it("returns 200 for a valid partial update", async () => {
    taskService.updateTask.mockResolvedValue({ ...SAMPLE_TASK, status: "InProgress" });

    const res = await request(app)
      .patch(`/api/tasks/${VALID_ID}`)
      .send({ status: "InProgress" });

    expect(res.status).toBe(200);
  });

  it("returns 404 when the task does not exist", async () => {
    taskService.updateTask.mockResolvedValue(null);

    const res = await request(app)
      .patch(`/api/tasks/${VALID_ID}`)
      .send({ status: "InProgress" });

    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed id", async () => {
    const res = await request(app).patch("/api/tasks/not-a-uuid").send({ title: "x" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for an invalid enum in the patch body", async () => {
    const res = await request(app)
      .patch(`/api/tasks/${VALID_ID}`)
      .send({ status: "NotAStatus" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/tasks/:id", () => {
  it("returns 204 when the task exists", async () => {
    taskService.deleteTask.mockResolvedValue(undefined);

    const res = await request(app).delete(`/api/tasks/${VALID_ID}`);
    expect(res.status).toBe(204);
  });

  it("is idempotent: returns 204 even if the task was already deleted", async () => {
    taskService.deleteTask.mockResolvedValue(undefined);

    await request(app).delete(`/api/tasks/${VALID_ID}`);
    const secondRes = await request(app).delete(`/api/tasks/${VALID_ID}`);

    expect(secondRes.status).toBe(204);
  });

  it("returns 400 for a malformed id", async () => {
    const res = await request(app).delete("/api/tasks/not-a-uuid");
    expect(res.status).toBe(400);
  });
});
