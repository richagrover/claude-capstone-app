/**
 * GitHub provider adapter. Reads GITHUB_TOKEN/GITHUB_REPO once at module load; no other layer
 * ever sees the raw token (NFR-1). Maps a TaskSnapshot onto a GitHub issue.
 */
import type { SyncProviderClient } from "../providerInterface";
import type { TaskSnapshot } from "../types";

const GITHUB_API_BASE_URL = "https://api.github.com";

export function isGithubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}

function authHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "Content-Type": "application/json",
  };
}

function toIssueBody(snapshot: TaskSnapshot): {
  title: string;
  body: string;
  labels: string[];
} {
  return {
    title: snapshot.title,
    body: `Assignee: ${snapshot.assignee ?? "unassigned"}\nPriority: ${snapshot.priority}\nStatus: ${snapshot.status}`,
    labels: snapshot.labels,
  };
}

/**
 * Creates a GitHubProviderClient bound to the given repo/token. Reading the credentials happens
 * once, at construction time (module load in production usage), never per-call elsewhere.
 */
export function createGithubProvider(
  token: string,
  repo: string,
): SyncProviderClient {
  return {
    async createIssue(snapshot: TaskSnapshot) {
      const response = await fetch(
        `${GITHUB_API_BASE_URL}/repos/${repo}/issues`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify(toIssueBody(snapshot)),
        },
      );
      if (!response.ok) {
        throw new Error(`GitHub createIssue failed with status ${response.status}`);
      }
      const data = (await response.json()) as { html_url: string };
      return { externalKeyOrUrl: data.html_url };
    },

    async updateIssue(externalKeyOrUrl: string, snapshot: TaskSnapshot) {
      const response = await fetch(toApiIssueUrl(externalKeyOrUrl, repo), {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify(toIssueBody(snapshot)),
      });
      if (!response.ok) {
        throw new Error(`GitHub updateIssue failed with status ${response.status}`);
      }
    },

    async closeIssue(externalKeyOrUrl: string) {
      const response = await fetch(toApiIssueUrl(externalKeyOrUrl, repo), {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ state: "closed" }),
      });
      if (!response.ok) {
        throw new Error(`GitHub closeIssue failed with status ${response.status}`);
      }
    },
  };
}

/** Converts a stored html_url (e.g. https://github.com/org/repo/issues/42) back to the API URL. */
function toApiIssueUrl(externalKeyOrUrl: string, repo: string): string {
  const match = externalKeyOrUrl.match(/\/issues\/(\d+)$/);
  const issueNumber = match ? match[1] : externalKeyOrUrl;
  return `${GITHUB_API_BASE_URL}/repos/${repo}/issues/${issueNumber}`;
}

/**
 * Lazily constructed singleton used by the worker process. Returns null when GitHub is not
 * configured, so the worker can skip starting this provider's lane without crashing
 * (architecture §6 step 6 — partial provider configuration).
 */
let cachedProvider: SyncProviderClient | null = null;
export function getGithubProvider(): SyncProviderClient | null {
  if (!isGithubConfigured()) return null;
  if (!cachedProvider) {
    cachedProvider = createGithubProvider(
      process.env.GITHUB_TOKEN as string,
      process.env.GITHUB_REPO as string,
    );
  }
  return cachedProvider;
}
