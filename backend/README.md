# Task Manager — Backend

Express + TypeScript + Prisma (PostgreSQL) API, with BullMQ/Redis-backed per-provider sync
workers for GitHub and Jira. See `docs/MDP-7/02-architecture.md` and
`docs/MDP-7/04-impl-plan.md` for the full design contract.

## Setup

1. Copy the environment template and fill in real values locally (never commit `.env`):

   ```
   cp .env.example .env
   ```

   Required variables (see `.env.example` for the full list, names only per NFR-1):
   `DATABASE_URL`, `REDIS_URL`, and — optionally, per provider — `GITHUB_TOKEN`/`GITHUB_REPO`
   and/or `JIRA_API_TOKEN`/`JIRA_BASE_URL`/`JIRA_PROJECT_KEY`. `FRONTEND_ORIGIN` and `PORT` are
   also required for CORS and the HTTP listener. `QUEUE_CONCURRENCY` defaults to `1` if unset.

2. Install dependencies:

   ```
   npm install
   ```

3. Apply the database schema:

   ```
   npm run prisma:migrate
   ```

4. Start the API server:

   ```
   npm run dev
   ```

5. In a separate terminal, start the sync worker process (only providers with complete
   credentials will start their queue — see architecture §6 step 6):

   ```
   npm run worker
   ```

## Tests

```
npm test
```

Runs the Vitest suite covering `validation.ts`, `taskService`, `syncHealthService`, the
`/api/tasks` and `/api/sync-health` routes (Supertest, Prisma/queue mocked), CORS/payload-limit
hardening, and the sync worker's create/update/close and failure-handling paths.
