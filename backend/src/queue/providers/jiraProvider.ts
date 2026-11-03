import type { SyncProviderClient } from '../providerInterface';

/**
 * Stubbed Jira client. T-4 (real Jira REST API v3 integration) is
 * blocked_on_config (JIRA_PROJECT_KEY is TBD, see
 * docs/artifacts/MDP-7/phase-02-architecture.md Config section) and is out
 * of scope for this dev pass.
 *
 * This deliberately never fabricates a project key — if JIRA_PROJECT_KEY is
 * unset, every call fails with an explicit, descriptive error so the
 * failure is visible via SyncLink/SyncAttempt (and the sync-health
 * dashboard) rather than silently "succeeding" against a made-up project.
 *
 * Swap this module's exported object for a real implementation of
 * SyncProviderClient (calling `${JIRA_BASE_URL}/rest/api/3/issue` with
 * JIRA_API_TOKEN) once config is available — the worker (../workers.ts)
 * only depends on the SyncProviderClient interface, not this file.
 */
export const jiraProvider: SyncProviderClient = {
  async createIssue() {
    const projectKey = process.env.JIRA_PROJECT_KEY;
    if (!projectKey) {
      return {
        ok: false,
        error:
          'JIRA_PROJECT_KEY is not configured (blocked_on_config) — stub Jira provider cannot create an issue',
      };
    }
    return {
      ok: false,
      error: 'Jira integration not implemented yet (T-4 is out of scope for this dev pass)',
    };
  },

  async updateIssue() {
    const projectKey = process.env.JIRA_PROJECT_KEY;
    if (!projectKey) {
      return {
        ok: false,
        error:
          'JIRA_PROJECT_KEY is not configured (blocked_on_config) — stub Jira provider cannot update an issue',
      };
    }
    return {
      ok: false,
      error: 'Jira integration not implemented yet (T-4 is out of scope for this dev pass)',
    };
  },

  async closeIssue() {
    return {
      ok: false,
      error: 'Jira integration not implemented yet (T-4 is out of scope for this dev pass)',
    };
  },
};
