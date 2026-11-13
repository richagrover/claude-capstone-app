import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

import { createApp, RATE_LIMIT_MAX_REQUESTS } from "../app";

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

describe("Rate limiting (resolves NFR-8(c) / AC-10)", () => {
  it("returns 429 with the structured body once the per-window request cap is exceeded", async () => {
    const app = createApp(); // one instance for the whole test — the limiter's in-memory
                              // bucket must be shared across every request below
    for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
      const res = await request(app).get("/api/tasks").set("Origin", "http://localhost:5173");
      expect(res.status).not.toBe(429);
    }
    const res = await request(app).get("/api/tasks").set("Origin", "http://localhost:5173");
    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: "rate_limited",
      message: "Too many requests. Please try again later.",
    });
  }, 20_000); // 101 sequential in-process requests; default vitest timeout may be tight
});

describe("Trust proxy configuration (resolves SEC-6)", () => {
  afterEach(() => {
    delete process.env.TRUST_PROXY;
  });

  it("defaults to not trusting any proxy when TRUST_PROXY is unset", () => {
    const app = createApp();
    expect(app.get("trust proxy")).toBe(false);
  });

  it("trusts the configured number of hops when TRUST_PROXY is set", () => {
    process.env.TRUST_PROXY = "1";
    const app = createApp();
    expect(app.get("trust proxy")).toBe(1);
  });

  it("rejects an invalid TRUST_PROXY value at app-creation time", () => {
    process.env.TRUST_PROXY = "not-a-number";
    expect(() => createApp()).toThrow();
  });
});
