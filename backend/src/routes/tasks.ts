/**
 * /api/tasks routes — thin layer: parse/validate via validation.ts, delegate to taskService,
 * map results to the status codes in architecture §5. Never calls Prisma directly.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  updateTask,
} from "../services/taskService";
import { sendValidationError } from "../errorHandler";
import {
  clampLimit,
  clampOffset,
  parseTaskPriority,
  parseTaskStatus,
  validateAssignee,
  validateDescription,
  validateDueDate,
  validateIdParam,
  validateLabels,
  validateTitle,
} from "../validation";

export const tasksRouter = Router();

tasksRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const statusResult = parseTaskStatus(req.query.status);
      if (!statusResult.ok) return sendValidationError(res, statusResult.error);

      const priorityResult = parseTaskPriority(req.query.priority);
      if (!priorityResult.ok) return sendValidationError(res, priorityResult.error);

      const assignee =
        typeof req.query.assignee === "string" ? req.query.assignee : undefined;

      const result = await listTasks({
        status: statusResult.value,
        priority: priorityResult.value,
        assignee,
        limit: clampLimit(req.query.limit),
        offset: clampOffset(req.query.offset),
      });

      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  },
);

tasksRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const titleResult = validateTitle(req.body?.title);
      if (!titleResult.ok) return sendValidationError(res, titleResult.error);

      const descriptionResult = validateDescription(req.body?.description);
      if (!descriptionResult.ok) return sendValidationError(res, descriptionResult.error);

      const statusResult = parseTaskStatus(req.body?.status);
      if (!statusResult.ok) return sendValidationError(res, statusResult.error);

      const priorityResult = parseTaskPriority(req.body?.priority);
      if (!priorityResult.ok) return sendValidationError(res, priorityResult.error);

      const assigneeResult = validateAssignee(req.body?.assignee);
      if (!assigneeResult.ok) return sendValidationError(res, assigneeResult.error);

      const labelsResult = validateLabels(req.body?.labels);
      if (!labelsResult.ok) return sendValidationError(res, labelsResult.error);

      const dueDateResult = validateDueDate(req.body?.dueDate);
      if (!dueDateResult.ok) return sendValidationError(res, dueDateResult.error);

      const task = await createTask({
        title: titleResult.value,
        description: descriptionResult.value,
        status: statusResult.value,
        priority: priorityResult.value,
        assignee: assigneeResult.value,
        labels: labelsResult.value,
        dueDate: dueDateResult.value,
      });

      res.status(201).json(task);
    } catch (error) {
      next(error);
    }
  },
);

tasksRouter.get(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idResult = validateIdParam(req.params.id);
      if (!idResult.ok) return sendValidationError(res, idResult.error);

      const task = await getTask(idResult.value);
      if (!task) {
        return res
          .status(404)
          .json({ error: "not_found", message: "Task not found." });
      }

      res.status(200).json(task);
    } catch (error) {
      next(error);
    }
  },
);

tasksRouter.patch(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idResult = validateIdParam(req.params.id);
      if (!idResult.ok) return sendValidationError(res, idResult.error);

      const patch: Record<string, unknown> = {};

      if ("title" in (req.body ?? {})) {
        const titleResult = validateTitle(req.body.title);
        if (!titleResult.ok) return sendValidationError(res, titleResult.error);
        patch.title = titleResult.value;
      }
      if ("description" in (req.body ?? {})) {
        const descriptionResult = validateDescription(req.body.description);
        if (!descriptionResult.ok) return sendValidationError(res, descriptionResult.error);
        patch.description = descriptionResult.value;
      }
      if ("status" in (req.body ?? {})) {
        const statusResult = parseTaskStatus(req.body.status);
        if (!statusResult.ok) return sendValidationError(res, statusResult.error);
        patch.status = statusResult.value;
      }
      if ("priority" in (req.body ?? {})) {
        const priorityResult = parseTaskPriority(req.body.priority);
        if (!priorityResult.ok) return sendValidationError(res, priorityResult.error);
        patch.priority = priorityResult.value;
      }
      if ("assignee" in (req.body ?? {})) {
        const assigneeResult = validateAssignee(req.body.assignee);
        if (!assigneeResult.ok) return sendValidationError(res, assigneeResult.error);
        patch.assignee = assigneeResult.value;
      }
      if ("labels" in (req.body ?? {})) {
        const labelsResult = validateLabels(req.body.labels);
        if (!labelsResult.ok) return sendValidationError(res, labelsResult.error);
        patch.labels = labelsResult.value;
      }
      if ("dueDate" in (req.body ?? {})) {
        const dueDateResult = validateDueDate(req.body.dueDate);
        if (!dueDateResult.ok) return sendValidationError(res, dueDateResult.error);
        patch.dueDate = dueDateResult.value;
      }

      const updated = await updateTask(idResult.value, patch);
      if (!updated) {
        return res
          .status(404)
          .json({ error: "not_found", message: "Task not found." });
      }

      res.status(200).json(updated);
    } catch (error) {
      next(error);
    }
  },
);

tasksRouter.delete(
  "/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const idResult = validateIdParam(req.params.id);
      if (!idResult.ok) return sendValidationError(res, idResult.error);

      // Idempotent: a repeat delete on an already-missing id still returns 204
      // (docs/MDP-7/04-impl-plan.md M4.1).
      await deleteTask(idResult.value);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  },
);
