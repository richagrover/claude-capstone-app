/**
 * Worker process entrypoint — run via `npm run worker`, as a separate process from the API
 * server (architecture S-2: statelessness). Starts both provider workers independently; a
 * missing provider's credentials never crash this process (architecture §6 step 6).
 */
import { createProviderWorker } from "./workers";
import { getGithubProvider } from "./providers/githubProvider";
import { getJiraProvider } from "./providers/jiraProvider";

function main(): void {
  const githubWorker = createProviderWorker("github", getGithubProvider());
  const jiraWorker = createProviderWorker("jira", getJiraProvider());

  if (!githubWorker && !jiraWorker) {
    // eslint-disable-next-line no-console
    console.warn(
      "No sync providers are configured. Worker process is idle until GitHub and/or Jira credentials are set.",
    );
  } else {
    // eslint-disable-next-line no-console
    console.log("Sync worker process started.");
  }
}

main();
