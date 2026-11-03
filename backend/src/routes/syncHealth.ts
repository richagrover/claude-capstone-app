import { Router } from 'express';
import { getSyncHealth } from '../services/syncHealthService';

export const syncHealthRouter = Router();

// GET /api/sync-health
syncHealthRouter.get('/', async (_req, res, next) => {
  try {
    const health = await getSyncHealth();
    res.json(health);
  } catch (err) {
    next(err);
  }
});
