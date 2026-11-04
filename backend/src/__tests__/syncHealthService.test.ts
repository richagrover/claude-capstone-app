import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock(...) factories are hoisted above the rest of this module, so any variable they
// close over must be created inside vi.hoisted() — otherwise it is accessed in its TDZ
// (ReferenceError: "Cannot access '<name>' before initialization").
const { mockPrisma, configuredProviders } = vi.hoisted(() => ({
  mockPrisma: {
    task: {
      findMany: vi.fn(),
    },
    syncLink: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  },
  configuredProviders: vi.fn(),
}));

vi.mock("../db", () => ({ prisma: mockPrisma }));

vi.mock("../queue/enqueueSync", () => ({
  configuredProviders: () => configuredProviders(),
}));

import { clearSyncHealthCache, getSyncHealth } from "../services/syncHealthService";

beforeEach(() => {
  vi.clearAllMocks();
  clearSyncHealthCache();
  configuredProviders.mockReturnValue(["github", "jira"]);
});

describe("getSyncHealth", () => {
  it("returns all-zero counts when there are no tasks", async () => {
    mockPrisma.task.findMany.mockResolvedValue([]);
    mockPrisma.syncLink.findMany.mockResolvedValue([]);

    const result = await getSyncHealth();

    expect(result.counts).toEqual({ ok: 0, failed: 0, pending: 0 });
    expect(mockPrisma.syncLink.groupBy).not.toHaveBeenCalled();
  });

  it("derives pending as existing tasks minus terminal-status rows", async () => {
    mockPrisma.task.findMany.mockResolvedValue([{ id: "t1" }, { id: "t2" }]);
    mockPrisma.syncLink.groupBy.mockResolvedValue([
      { provider: "github", lastStatus: "ok", _count: { _all: 1 } },
    ]);
    mockPrisma.syncLink.findMany.mockResolvedValue([]);

    const result = await getSyncHealth();

    expect(result.byProvider.github).toEqual({ ok: 1, failed: 0, pending: 1 });
    // jira has zero rows at all => all tasks pending for jira
    expect(result.byProvider.jira).toEqual({ ok: 0, failed: 0, pending: 2 });
  });

  it("reports a mix of ok/failed/pending correctly", async () => {
    mockPrisma.task.findMany.mockResolvedValue([
      { id: "t1" },
      { id: "t2" },
      { id: "t3" },
    ]);
    mockPrisma.syncLink.groupBy.mockResolvedValue([
      { provider: "github", lastStatus: "ok", _count: { _all: 1 } },
      { provider: "github", lastStatus: "failed", _count: { _all: 1 } },
    ]);
    mockPrisma.syncLink.findMany.mockResolvedValue([
      { taskId: "t2", provider: "github", lastError: "Provider timeout" },
    ]);

    const result = await getSyncHealth();

    expect(result.byProvider.github).toEqual({ ok: 1, failed: 1, pending: 1 });
    expect(result.failing).toEqual([
      { taskId: "t2", provider: "github", lastError: "Provider timeout" },
    ]);
  });

  it("excludes a deleted task's stale SyncLink from the existing-tasks denominator", async () => {
    // Only t1 currently exists; a stale SyncLink for a deleted task (t-deleted) must not be
    // counted — architecture §4's explicit edge case.
    mockPrisma.task.findMany.mockResolvedValue([{ id: "t1" }]);
    mockPrisma.syncLink.groupBy.mockResolvedValue([
      { provider: "github", lastStatus: "ok", _count: { _all: 1 } },
    ]);
    mockPrisma.syncLink.findMany.mockResolvedValue([]);

    const result = await getSyncHealth();

    // groupBy was called scoped to existing task ids only (t1), never the deleted one.
    expect(mockPrisma.syncLink.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { taskId: { in: ["t1"] } } }),
    );
    expect(result.byProvider.github).toEqual({ ok: 1, failed: 0, pending: 0 });
  });

  it("serves a cached result within the TTL window without recomputing", async () => {
    mockPrisma.task.findMany.mockResolvedValue([{ id: "t1" }]);
    mockPrisma.syncLink.groupBy.mockResolvedValue([]);
    mockPrisma.syncLink.findMany.mockResolvedValue([]);

    await getSyncHealth();
    await getSyncHealth();

    expect(mockPrisma.task.findMany).toHaveBeenCalledTimes(1);
  });

  it("recomputes after the cache is cleared (simulating TTL expiry)", async () => {
    mockPrisma.task.findMany.mockResolvedValue([{ id: "t1" }]);
    mockPrisma.syncLink.groupBy.mockResolvedValue([]);
    mockPrisma.syncLink.findMany.mockResolvedValue([]);

    await getSyncHealth();
    clearSyncHealthCache();
    await getSyncHealth();

    expect(mockPrisma.task.findMany).toHaveBeenCalledTimes(2);
  });

  it("filters to a single provider when requested", async () => {
    mockPrisma.task.findMany.mockResolvedValue([{ id: "t1" }]);
    mockPrisma.syncLink.groupBy.mockResolvedValue([
      { provider: "jira", lastStatus: "ok", _count: { _all: 1 } },
    ]);
    mockPrisma.syncLink.findMany.mockResolvedValue([]);

    const result = await getSyncHealth("jira");

    expect(result.byProvider).toEqual({ jira: { ok: 1, failed: 0, pending: 0 } });
    expect(result.byProvider.github).toBeUndefined();
  });
});
