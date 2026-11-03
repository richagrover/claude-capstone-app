import express from 'express';
import cors from 'cors';
import { tasksRouter } from './routes/tasks';
import { syncHealthRouter } from './routes/syncHealth';
import { errorHandler } from './errorHandler';

export function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));

  // REST API surface per docs/artifacts/MDP-7/phase-02-architecture.md
  app.use('/api/tasks', tasksRouter);
  app.use('/api/sync-health', syncHealthRouter);

  app.use(errorHandler);

  return app;
}
