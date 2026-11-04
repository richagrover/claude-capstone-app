/**
 * One BullMQ Queue instance per provider, both configured with a bounded exponential-backoff
 * retry policy (architecture §6 step 5): a provider outage cannot exhaust its own rate limits
 * via a tight retry loop, and once attempts are exhausted the terminal `failed` state is already
 * recorded (never silently dropped).
 */
import { Queue } from "bullmq";
import { getRedisConnection } from "./connection";
import { QUEUE_NAMES } from "./queueNames";
import type { SyncJobPayload } from "./types";

export const SYNC_JOB_RETRY_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 1000 },
} as const;

let githubQueue: Queue<SyncJobPayload> | null = null;
let jiraQueue: Queue<SyncJobPayload> | null = null;

export function getGithubQueue(): Queue<SyncJobPayload> {
  if (!githubQueue) {
    githubQueue = new Queue<SyncJobPayload>(QUEUE_NAMES.github, {
      connection: getRedisConnection(),
      defaultJobOptions: SYNC_JOB_RETRY_OPTIONS,
    });
  }
  return githubQueue;
}

export function getJiraQueue(): Queue<SyncJobPayload> {
  if (!jiraQueue) {
    jiraQueue = new Queue<SyncJobPayload>(QUEUE_NAMES.jira, {
      connection: getRedisConnection(),
      defaultJobOptions: SYNC_JOB_RETRY_OPTIONS,
    });
  }
  return jiraQueue;
}

/** Returns all configured provider queues, keyed by provider name. */
export function getAllQueues(): Record<"github" | "jira", Queue<SyncJobPayload>> {
  return {
    github: getGithubQueue(),
    jira: getJiraQueue(),
  };
}
