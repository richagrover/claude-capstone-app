import 'dotenv/config';
import { Worker } from 'bullmq';
import { connection } from './connection';
import { GITHUB_QUEUE_NAME, JIRA_QUEUE_NAME } from './queueNames';
import { processSyncJob } from './workers';

const CONCURRENCY = Number(process.env.SYNC_WORKER_CONCURRENCY ?? 5);

const jiraWorker = new Worker(JIRA_QUEUE_NAME, processSyncJob, { connection, concurrency: CONCURRENCY });
const githubWorker = new Worker(GITHUB_QUEUE_NAME, processSyncJob, { connection, concurrency: CONCURRENCY });

for (const worker of [jiraWorker, githubWorker]) {
  worker.on('completed', (job) => {
    // eslint-disable-next-line no-console
    console.log(`[${worker.name}] job ${job.id} (task ${job.data.taskId}) completed`);
  });
  worker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(
      `[${worker.name}] job ${job?.id} (task ${job?.data.taskId}) failed on attempt ${job?.attemptsMade}: ${err.message}`
    );
  });
}

// eslint-disable-next-line no-console
console.log(`Sync workers started: ${JIRA_QUEUE_NAME}, ${GITHUB_QUEUE_NAME}`);
