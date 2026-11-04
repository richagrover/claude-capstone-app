/**
 * Jira provider adapter. Reads JIRA_API_TOKEN/JIRA_BASE_URL/JIRA_PROJECT_KEY once at module
 * load; no other layer ever sees the raw token (NFR-1). Maps a TaskSnapshot onto a Jira issue.
 */
import type { SyncProviderClient } from "../providerInterface";
import type { TaskSnapshot } from "../types";

export function isJiraConfigured(): boolean {
  return Boolean(
    process.env.JIRA_API_TOKEN &&
      process.env.JIRA_BASE_URL &&
      process.env.JIRA_PROJECT_KEY,
  );
}

function authHeaders(apiToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiToken}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

const PRIORITY_MAP: Record<TaskSnapshot["priority"], string> = {
  Low: "Low",
  Medium: "Medium",
  High: "High",
};

function toIssueFields(snapshot: TaskSnapshot, projectKey: string) {
  return {
    fields: {
      project: { key: projectKey },
      summary: snapshot.title,
      issuetype: { name: "Task" },
      priority: { name: PRIORITY_MAP[snapshot.priority] },
      labels: snapshot.labels,
      assignee: snapshot.assignee ? { name: snapshot.assignee } : undefined,
    },
  };
}

/** Creates a JiraProviderClient bound to the given base URL/project/token. */
export function createJiraProvider(
  apiToken: string,
  baseUrl: string,
  projectKey: string,
): SyncProviderClient {
  return {
    async createIssue(snapshot: TaskSnapshot) {
      const response = await fetch(`${baseUrl}/rest/api/2/issue`, {
        method: "POST",
        headers: authHeaders(apiToken),
        body: JSON.stringify(toIssueFields(snapshot, projectKey)),
      });
      if (!response.ok) {
        throw new Error(`Jira createIssue failed with status ${response.status}`);
      }
      const data = (await response.json()) as { key: string };
      return { externalKeyOrUrl: data.key };
    },

    async updateIssue(externalKeyOrUrl: string, snapshot: TaskSnapshot) {
      const response = await fetch(
        `${baseUrl}/rest/api/2/issue/${externalKeyOrUrl}`,
        {
          method: "PUT",
          headers: authHeaders(apiToken),
          body: JSON.stringify(toIssueFields(snapshot, projectKey)),
        },
      );
      if (!response.ok) {
        throw new Error(`Jira updateIssue failed with status ${response.status}`);
      }
    },

    async closeIssue(externalKeyOrUrl: string) {
      const response = await fetch(
        `${baseUrl}/rest/api/2/issue/${externalKeyOrUrl}/transitions`,
        {
          method: "POST",
          headers: authHeaders(apiToken),
          body: JSON.stringify({ transition: { id: "closed" } }),
        },
      );
      if (!response.ok) {
        throw new Error(`Jira closeIssue failed with status ${response.status}`);
      }
    },
  };
}

let cachedProvider: SyncProviderClient | null = null;
export function getJiraProvider(): SyncProviderClient | null {
  if (!isJiraConfigured()) return null;
  if (!cachedProvider) {
    cachedProvider = createJiraProvider(
      process.env.JIRA_API_TOKEN as string,
      process.env.JIRA_BASE_URL as string,
      process.env.JIRA_PROJECT_KEY as string,
    );
  }
  return cachedProvider;
}
