import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncProviderClient } from "../queue/providerInterface";
import type { SyncJobPayload, TaskSnapshot } from "../queue/types";

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
  $transaction: vi.fn(async (callback: (tx: unknown) => Promise<void>) => callback(txMock)),
}));

vi.mock("../db", () => ({ prisma: mockPrisma }));

import { processSyncJob } from "../queue/workers";

const SNAPSHOT: TaskSnapshot = {
  title: "Fix the bug",
  status: "Backlog",
  priority: "Medium",
  assignee: null,
  labels: [],
};

function makeFailingProvider(): SyncProviderClient {
  return {
    createIssue: vi.fn().mockRejectedValue(new Error("GitHub createIssue failed with status 503")),
    updateIssue: vi.fn().mockRejectedValue(new Error("update failed")),
    closeIssue: vi.fn().mockRejectedValue(new Error("close failed")),
  };
}

beforeEach(() => {
  storedLink = null;
  syncAttempts.length = 0;
  vi.clearAllMocks();
});

describe("processSyncJob — failure handling (resolves G-1 failure bookkeeping)", () => {
  it("records a failed SyncAttempt and SyncLink when the provider call throws", async () => {
    const provider = makeFailingProvider();
    const payload: SyncJobPayload = {
      taskId: "task-fail-1",
      provider: "github",
      operation: "create",
      snapshot: SNAPSHOT,
    };

    await expect(processSyncJob(payload, provider)).rejects.toThrow(
      "GitHub createIssue failed with status 503",
    );

    expect(storedLink?.lastStatus).toBe("failed");
    expect(storedLink?.lastError).toContain("GitHub createIssue failed");
    expect(syncAttempts).toHaveLength(1);
    expect(syncAttempts[0].result).toBe("failed");
  });

  it("never lets the process crash: the rejection is a normal Error, not an uncaught exception", async () => {
    const provider = makeFailingProvider();
    const payload: SyncJobPayload = {
      taskId: "task-fail-2",
      provider: "jira",
      operation: "create",
      snapshot: SNAPSHOT,
    };

    let caught: unknown;
    try {
      await processSyncJob(payload, provider);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    // BullMQ (not exercised directly here) is what turns this rejection into a scheduled retry
    // per the queue's bounded exponential-backoff policy configured in queues.ts.
  });

  it("does not record a credential value in lastError, only a human-readable reason (NFR-1)", async () => {
    const provider: SyncProviderClient = {
      createIssue: vi.fn().mockRejectedValue(new Error("Unauthorized: invalid token")),
      updateIssue: vi.fn(),
      closeIssue: vi.fn(),
    };
    const payload: SyncJobPayload = {
      taskId: "task-fail-3",
      provider: "github",
      operation: "create",
      snapshot: SNAPSHOT,
    };

    await expect(processSyncJob(payload, provider)).rejects.toThrow();

    expect(storedLink?.lastError).toBe("Unauthorized: invalid token");
    expect(storedLink?.lastError).not.toMatch(/ghp_|Bearer\s+\S+/);
  });
});
