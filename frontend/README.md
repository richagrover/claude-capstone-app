# Task Manager — Frontend

React + TypeScript + Vite app: task board (CRUD, filters, pagination) and a polling sync-health
panel. See `docs/MDP-7/02-architecture.md` and `docs/MDP-7/04-impl-plan.md` for the full design
contract.

## Setup

1. Copy the environment template and fill in the backend's URL locally (never commit `.env`):

   ```
   cp .env.example .env
   ```

   `VITE_API_BASE_URL` should point at the running backend's `/api` base path, e.g.
   `http://localhost:3000/api`.

2. Install dependencies:

   ```
   npm install
   ```

3. Start the dev server:

   ```
   npm run dev
   ```

## Tests

```
npm test
```

Runs the Vitest + React Testing Library suite (`TaskBoard.test.tsx`, `useTasks.test.ts`) with the
API layer mocked — no backend required to run the frontend test suite.
