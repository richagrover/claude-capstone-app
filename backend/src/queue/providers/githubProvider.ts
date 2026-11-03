import type { SyncProviderClient } from '../providerInterface';

/**
 * Stubbed GitHub client. T-5 (real GitHub REST API integration) is
 * blocked_on_config (GITHUB_REPO is TBD, see
 * docs/artifacts/MDP-7/phase-02-architecture.md Config section) and is out
 * of scope for this dev pass.
 *
 * Mirrors jiraProvider.ts: never fabricates a repo — if GITHUB_REPO is
 * unset, every call fails with an explicit error visible via
 * SyncLink/SyncAttempt rather than silently succeeding.
 *
 * Swap this module's exported object for a real implementation of
 * SyncProviderClient (calling the GitHub REST API against GITHUB_REPO with
 * GITHUB_TOKEN) once config is available.
 */
export const githubProvider: SyncProviderClient = {
  async createIssue() {
    const repo = process.env.GITHUB_REPO;
    if (!repo) {
      return {
        ok: false,
        error:
          'GITHUB_REPO is not configured (blocked_on_config) — stub GitHub provider cannot create an issue',
      };
    }
    return {
      ok: false,
      error: 'GitHub integration not implemented yet (T-5 is out of scope for this dev pass)',
    };
  },

  async updateIssue() {
    const repo = process.env.GITHUB_REPO;
    if (!repo) {
      return {
        ok: false,
        error:
          'GITHUB_REPO is not configured (blocked_on_config) — stub GitHub provider cannot update an issue',
      };
    }
    return {
      ok: false,
      error: 'GitHub integration not implemented yet (T-5 is out of scope for this dev pass)',
    };
  },

  async closeIssue() {
    return {
      ok: false,
      error: 'GitHub integration not implemented yet (T-5 is out of scope for this dev pass)',
    };
  },
};
