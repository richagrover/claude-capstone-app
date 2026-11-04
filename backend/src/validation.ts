/**
 * Centralized request-validation helpers.
 *
 * Every validator returns a discriminated `ValidationResult` instead of throwing — expected
 * validation failures are not "unhandled exceptions" (code-quality rule / NFR-3), they are
 * ordinary, typed outcomes the caller (routes layer) maps to a 400 response.
 */
import { TaskPriority, TaskStatus } from "@prisma/client";

export type ValidationError = { code: string; message: string };

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ValidationError };

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function fail<T>(code: string, message: string): ValidationResult<T> {
  return { ok: false, error: { code, message } };
}

// --- Field-length caps (resolves SEC-3: no unbounded payload fields) ---------------------
export const LIMITS = {
  TITLE_MIN_LENGTH: 1,
  TITLE_MAX_LENGTH: 200,
  DESCRIPTION_MAX_LENGTH: 5000,
  ASSIGNEE_MAX_LENGTH: 200,
  LABELS_MAX_COUNT: 20,
  LABEL_MAX_LENGTH: 50,
  LIST_DEFAULT_LIMIT: 50,
  LIST_MAX_LIMIT: 200,
} as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Validates a route `:id` param is a well-formed UUID before it ever reaches the database. */
export function isValidUuid(id: string): boolean {
  return typeof id === "string" && UUID_PATTERN.test(id);
}

export function validateIdParam(id: string): ValidationResult<string> {
  if (!isValidUuid(id)) {
    return fail("invalid_id", "The provided id is not a well-formed UUID.");
  }
  return ok(id);
}

const TASK_STATUS_VALUES = Object.values(TaskStatus);
const TASK_PRIORITY_VALUES = Object.values(TaskPriority);

/** Rejects unknown status values; never silently coerces to a default (architecture §5.2). */
export function parseTaskStatus(
  value: unknown,
): ValidationResult<TaskStatus | undefined> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  if (
    typeof value === "string" &&
    (TASK_STATUS_VALUES as string[]).includes(value)
  ) {
    return ok(value as TaskStatus);
  }
  return fail(
    "invalid_status",
    `status must be one of: ${TASK_STATUS_VALUES.join(", ")}`,
  );
}

/** Rejects unknown priority values; never silently coerces to a default (architecture §5.2). */
export function parseTaskPriority(
  value: unknown,
): ValidationResult<TaskPriority | undefined> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  if (
    typeof value === "string" &&
    (TASK_PRIORITY_VALUES as string[]).includes(value)
  ) {
    return ok(value as TaskPriority);
  }
  return fail(
    "invalid_priority",
    `priority must be one of: ${TASK_PRIORITY_VALUES.join(", ")}`,
  );
}

export function validateTitle(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") {
    return fail("invalid_title", "title is required and must be a string.");
  }
  const trimmed = value.trim();
  if (
    trimmed.length < LIMITS.TITLE_MIN_LENGTH ||
    trimmed.length > LIMITS.TITLE_MAX_LENGTH
  ) {
    return fail(
      "invalid_title",
      `title must be between ${LIMITS.TITLE_MIN_LENGTH} and ${LIMITS.TITLE_MAX_LENGTH} characters after trimming.`,
    );
  }
  return ok(trimmed);
}

export function validateDescription(
  value: unknown,
): ValidationResult<string | undefined> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  if (typeof value !== "string") {
    return fail("invalid_description", "description must be a string.");
  }
  if (value.length > LIMITS.DESCRIPTION_MAX_LENGTH) {
    return fail(
      "invalid_description",
      `description must be at most ${LIMITS.DESCRIPTION_MAX_LENGTH} characters.`,
    );
  }
  return ok(value);
}

export function validateAssignee(
  value: unknown,
): ValidationResult<string | undefined> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  if (typeof value !== "string") {
    return fail("invalid_assignee", "assignee must be a string.");
  }
  if (value.length > LIMITS.ASSIGNEE_MAX_LENGTH) {
    return fail(
      "invalid_assignee",
      `assignee must be at most ${LIMITS.ASSIGNEE_MAX_LENGTH} characters.`,
    );
  }
  return ok(value);
}

export function validateLabels(
  value: unknown,
): ValidationResult<string[] | undefined> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  if (!Array.isArray(value)) {
    return fail("invalid_labels", "labels must be an array of strings.");
  }
  if (value.length > LIMITS.LABELS_MAX_COUNT) {
    return fail(
      "invalid_labels",
      `labels must contain at most ${LIMITS.LABELS_MAX_COUNT} items.`,
    );
  }
  for (const label of value) {
    if (typeof label !== "string" || label.length > LIMITS.LABEL_MAX_LENGTH) {
      return fail(
        "invalid_labels",
        `each label must be a string of at most ${LIMITS.LABEL_MAX_LENGTH} characters.`,
      );
    }
  }
  return ok(value as string[]);
}

export function validateDueDate(
  value: unknown,
): ValidationResult<Date | undefined> {
  if (value === undefined || value === null) {
    return ok(undefined);
  }
  if (typeof value !== "string" && !(value instanceof Date)) {
    return fail("invalid_due_date", "dueDate must be an ISO-8601 string.");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return fail("invalid_due_date", "dueDate must be a valid ISO-8601 date.");
  }
  return ok(date);
}

/** Clamps a requested pagination limit to [1, LIST_MAX_LIMIT] — resolves B-2. */
export function clampLimit(requested: unknown): number {
  const parsed =
    typeof requested === "string"
      ? Number.parseInt(requested, 10)
      : typeof requested === "number"
        ? requested
        : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return LIMITS.LIST_DEFAULT_LIMIT;
  }
  return Math.min(parsed, LIMITS.LIST_MAX_LIMIT);
}

export function clampOffset(requested: unknown): number {
  const parsed =
    typeof requested === "string"
      ? Number.parseInt(requested, 10)
      : typeof requested === "number"
        ? requested
        : NaN;
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}
