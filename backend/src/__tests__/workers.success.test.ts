import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncProviderClient } from "../queue/providerInterface";
import type { TaskSnapshot } from "../queue/types";

/**
 * In-memory stand-in for the single SyncLink row a (taskId, provider) pair can have — lets the
 * mocked transaction behave like a real upsert across sequential processSyncJob() calls,
 * without needing a live Postgres connection.
 */
let storedLink: {
  taskId: string;
  provider: string;
  externalKeyOrUrl: string | null;
  lastStatus: string | null;
  lastError: string | null;
} | null = null;

const syncAttempts: { taskId: string; provider: string; result: string; detail: string | null }[] =
  [];

const txMock = {
  $executeRawUnsafe: vi.fn().mockResolvedValue(undefined),
  syncLink: {
    findUnique: vi.fn(async () => storedLink),
    upsert: vi.fn(async ({ create, update }: { create: typeof storedLink; update: Partial<NonNullable<typeof storedLink>> }) => {
      storedLink = storedLink ? { ...storedLink, ...update } : create;
      return storedLink;
    }),
  },
  syncAttempt: {
    create: vi.fn(async ({ data }: { data: { taskId: string; provider: string; result: string; detail: string | null } }) => {
      syncAttempts.push(data);
      return data;
    }),
  },
};

// vi.mock(...) is hoisted above this file's other top-level code. Its factory must not close
// over a `const` that hasn't been initialized yet (TDZ: "Cannot access 'mockPrisma' before
// initialization"), so the mock object itself is built inside vi.hoisted(). The inner
// $transaction function only *references* `txMock` — it isn't called until a test actually
// invokes processSyncJob(), by which point `txMock` (declared above, in normal module order) is
// fully initialized.
const mockPrisma = vi.hoisted(() => ({
  $transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
    return callback(txMock);
  }),
}));

vi.mock("../db", () => ({ prisma: mockPrisma }));

import { getConfiguredConcurrency, processSyncJob } from "../queue/workers";
import type { SyncJobPayload } from "../queue/types";

const SNAPSHOT: TaskSnapshot = {
  title: "Fix the bug",
  status: "Backlog",
  priority: "Medium",
  assignee: null,
  labels: [],
};

function makeProvider(): SyncProviderClient & {
  createIssue: ReturnType<typeof vi.fn>;
  updateIssue: ReturnType<typeof vi.fn>;
  closeIssue: ReturnType<typeof vi.fn>;
} {
  return {
    createIssue: vi.fn().mockResolvedValue({ externalKeyOrUrl: "https://github.com/org/repo/issues/1" }),
    updateIssue: vi.fn().mockResolvedValue(undefined),
    closeIssue: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  storedLink = null;
  syncAttempts.length = 0;
  vi.clearAllMocks();
});

describe("processSyncJob — happy path", () => {
  it("creates the external issue on the first sync, then updates, then closes", async () => {
    const provider = makeProvider();
    const taskId = "task-1";

    const createPayload: SyncJobPayload = {
      taskId,
      provider: "github",
      operation: "create",
      snapshot: SNAPSHOT,
    };
    await processSyncJob(createPayload, provider);
    expect(provider.createIssue).toHaveBeenCalledTimes(1);
    expect(storedLink?.lastStatus).toBe("ok");
    expect(storedLink?.externalKeyOrUrl).toBe("https://github.com/org/repo/issues/1");

    const updatePayload: SyncJobPayload = {
      taskId,
      provider: "github",
      operation: "update",
      snapshot: { ...SNAPSHOT, status: "InProgress" },
    };
    await processSyncJob(updatePayload, provider);
    expect(provider.updateIssue).toHaveBeenCalledTimes(1);
    expect(provider.createIssue).toHaveBeenCalledTimes(1); // not called again

    const closePayload: SyncJobPayload = {
      taskId,
      provider: "github",
      operation: "close",
      snapshot: SNAPSHOT,
    };
    await processSyncJob(closePayload, provider);
    expect(provider.closeIssue).toHaveBeenCalledWith("https://github.com/org/repo/issues/1");

    expect(syncAttempts).toHaveLength(3);
    expect(syncAttempts.every((a) => a.result === "ok")).toBe(true);
  });

  it("acquires the (taskId, provider) advisory lock before deciding create vs update", async () => {
    const provider = makeProvider();
    await processSyncJob(
      { taskId: "task-2", provider: "jira", operation: "create", snapshot: SNAPSHOT },
      provider,
    );

    expect(txMock.$executeRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
      "task-2",
      "jira",
    );
  });

  it("only creates the issue once when two 'create' jobs land for the same (taskId, provider) — resolves G-1", async () => {
    // Models the dedup outcome the advisory lock + transactional upsert guarantees in
    // production: because each processSyncJob() call commits its SyncLink upsert before the
    // next call's create-vs-update decision reads it, a second "create" job for the same
    // (taskId, provider) sees the first's committed link and updates instead of duplicating.
    // (Exercising the actual Postgres advisory-lock contention under true concurrency requires
    // a live database and is out of scope for this mocked-Prisma unit test; see
    // docs/MDP-7/05-implementation-summary.md for this scoping note.)
    const provider = makeProvider();
    const taskId = "task-3";
    const payload: SyncJobPayload = {
      taskId,
      provider: "github",
      operation: "create",
      snapshot: SNAPSHOT,
    };

    await processSyncJob(payload, provider);
    await processSyncJob(payload, provider);

    expect(provider.createIssue).toHaveBeenCalledTimes(1);
    expect(provider.updateIssue).toHaveBeenCalledTimes(1);
  });
});

describe("getConfiguredConcurrency", () => {
  it("defaults to 1 when QUEUE_CONCURRENCY is unset", () => {
    delete process.env.QUEUE_CONCURRENCY;
    expect(getConfiguredConcurrency()).toBe(1);
  });

  it("reads a configured concurrency value", () => {
    process.env.QUEUE_CONCURRENCY = "3";
    expect(getConfiguredConcurrency()).toBe(3);
    delete process.env.QUEUE_CONCURRENCY;
  });

  it("falls back to 1 for a non-numeric value", () => {
    process.env.QUEUE_CONCURRENCY = "not-a-number";
    expect(getConfiguredConcurrency()).toBe(1);
    delete process.env.QUEUE_CONCURRENCY;
  });
});
