import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../services/taskService", () => ({
  listTasks: vi.fn().mockResolvedValue({ tasks: [], total: 0, limit: 50, offset: 0 }),
  getTask: vi.fn(),
  createTask: vi.fn(),
  updateTask: vi.fn(),
  deleteTask: vi.fn(),
}));
vi.mock("../services/syncHealthService", () => ({
  getSyncHealth: vi.fn().mockResolvedValue({ counts: {}, byProvider: {}, failing: [] }),
}));
vi.mock("../queue/enqueueSync", () => ({
  enqueueSyncForAllProviders: vi.fn(),
  configuredProviders: vi.fn().mockReturnValue([]),
}));

import { createApp } from "../app";

beforeEach(() => {
  process.env.FRONTEND_ORIGIN = "http://localhost:5173";
});

describe("CORS (resolves SEC-2)", () => {
  it("allows a request from the allowlisted origin", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/tasks")
      .set("Origin", "http://localhost:5173");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("rejects a request from a non-allowlisted origin", async () => {
    const app = createApp();
    const res = await request(app)
      .get("/api/tasks")
      .set("Origin", "https://evil.example.com");

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("cors_rejected");
  });
});

describe("Payload size limit (resolves SEC-3)", () => {
  it("rejects an oversized JSON body with 413 rather than crashing", async () => {
    const app = createApp();
    const oversizedDescription = "a".repeat(200 * 1024); // well over the 100kb limit

    const res = await request(app)
      .post("/api/tasks")
      .set("Origin", "http://localhost:5173")
      .send({ title: "Fix the bug", description: oversizedDescription });

    expect(res.status).toBe(413);
    expect(res.body.error).toBe("payload_too_large");
  });
});

describe("Not-found route", () => {
  it("returns a structured 404 for an unknown route", async () => {
    const app = createApp();
    const res = await request(app).get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("not_found");
  });
});
