import { Router } from 'express';
import { createTaskSchema, taskQuerySchema, updateTaskSchema } from '../validation';
import * as taskService from '../services/taskService';

export const tasksRouter = Router();

// GET /api/tasks?status=&assignee=&priority=
tasksRouter.get('/', async (req, res, next) => {
  try {
    const query = taskQuerySchema.parse(req.query);
    const tasks = await taskService.listTasks(query);
    res.json({ tasks });
  } catch (err) {
    next(err);
  }
});

// POST /api/tasks
tasksRouter.post('/', async (req, res, next) => {
  try {
    const input = createTaskSchema.parse(req.body);
    const task = await taskService.createTask(input);
    res.status(201).json(task);
  } catch (err) {
    next(err);
  }
});

// GET /api/tasks/:id
tasksRouter.get('/:id', async (req, res, next) => {
  try {
    const task = await taskService.getTaskById(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'task_not_found' });
      return;
    }
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/tasks/:id
tasksRouter.patch('/:id', async (req, res, next) => {
  try {
    const patch = updateTaskSchema.parse(req.body);
    const task = await taskService.updateTask(req.params.id, patch);
    if (!task) {
      res.status(404).json({ error: 'task_not_found' });
      return;
    }
    res.json(task);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/tasks/:id
tasksRouter.delete('/:id', async (req, res, next) => {
  try {
    const task = await taskService.deleteTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: 'task_not_found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
