import { describe, expect, it } from "vitest";
import {
  clampLimit,
  clampOffset,
  isValidUuid,
  LIMITS,
  parseTaskPriority,
  parseTaskStatus,
  validateAssignee,
  validateDescription,
  validateDueDate,
  validateIdParam,
  validateLabels,
  validateTitle,
} from "../validation";

describe("isValidUuid / validateIdParam", () => {
  it("accepts a well-formed UUID", () => {
    expect(isValidUuid("123e4567-e89b-42d3-a456-556642440000")).toBe(true);
    expect(validateIdParam("123e4567-e89b-42d3-a456-556642440000").ok).toBe(true);
  });

  it("rejects a malformed id", () => {
    expect(isValidUuid("not-a-uuid")).toBe(false);
    const result = validateIdParam("not-a-uuid");
    expect(result.ok).toBe(false);
  });
});

describe("validateTitle", () => {
  it("accepts a valid title and trims it", () => {
    const result = validateTitle("  Fix the bug  ");
    expect(result).toEqual({ ok: true, value: "Fix the bug" });
  });

  it("rejects an empty title", () => {
    const result = validateTitle("");
    expect(result.ok).toBe(false);
  });

  it("rejects a whitespace-only title", () => {
    const result = validateTitle("   ");
    expect(result.ok).toBe(false);
  });

  it("rejects a non-string title", () => {
    const result = validateTitle(42 as unknown as string);
    expect(result.ok).toBe(false);
  });

  it("accepts a title exactly at the max length boundary", () => {
    const title = "a".repeat(LIMITS.TITLE_MAX_LENGTH);
    expect(validateTitle(title).ok).toBe(true);
  });

  it("rejects an oversized title", () => {
    const title = "a".repeat(LIMITS.TITLE_MAX_LENGTH + 1);
    expect(validateTitle(title).ok).toBe(false);
  });
});

describe("validateDescription", () => {
  it("accepts undefined", () => {
    expect(validateDescription(undefined)).toEqual({ ok: true, value: undefined });
  });

  it("rejects an oversized description", () => {
    const description = "a".repeat(LIMITS.DESCRIPTION_MAX_LENGTH + 1);
    expect(validateDescription(description).ok).toBe(false);
  });

  it("accepts a description at the max boundary", () => {
    const description = "a".repeat(LIMITS.DESCRIPTION_MAX_LENGTH);
    expect(validateDescription(description).ok).toBe(true);
  });
});

describe("validateAssignee", () => {
  it("rejects an oversized assignee", () => {
    expect(validateAssignee("a".repeat(LIMITS.ASSIGNEE_MAX_LENGTH + 1)).ok).toBe(false);
  });
});

describe("validateLabels", () => {
  it("accepts a valid labels array", () => {
    expect(validateLabels(["bug", "urgent"]).ok).toBe(true);
  });

  it("rejects too many labels", () => {
    const labels = Array.from({ length: LIMITS.LABELS_MAX_COUNT + 1 }, (_, i) => `l${i}`);
    expect(validateLabels(labels).ok).toBe(false);
  });

  it("rejects a non-string label", () => {
    expect(validateLabels([1, 2] as unknown as string[]).ok).toBe(false);
  });

  it("rejects a non-array value", () => {
    expect(validateLabels("not-an-array" as unknown as string[]).ok).toBe(false);
  });
});

describe("validateDueDate", () => {
  it("accepts a valid ISO date string", () => {
    expect(validateDueDate("2026-01-01T00:00:00.000Z").ok).toBe(true);
  });

  it("rejects an invalid date string", () => {
    expect(validateDueDate("not-a-date").ok).toBe(false);
  });
});

describe("parseTaskStatus / parseTaskPriority", () => {
  it("accepts a known status", () => {
    expect(parseTaskStatus("InProgress")).toEqual({ ok: true, value: "InProgress" });
  });

  it("rejects an unknown status, never coercing", () => {
    const result = parseTaskStatus("NotAStatus");
    expect(result.ok).toBe(false);
  });

  it("accepts undefined status as optional", () => {
    expect(parseTaskStatus(undefined)).toEqual({ ok: true, value: undefined });
  });

  it("accepts a known priority", () => {
    expect(parseTaskPriority("High")).toEqual({ ok: true, value: "High" });
  });

  it("rejects an unknown priority", () => {
    expect(parseTaskPriority("Critical").ok).toBe(false);
  });
});

describe("clampLimit / clampOffset", () => {
  it("defaults when no limit is requested", () => {
    expect(clampLimit(undefined)).toBe(LIMITS.LIST_DEFAULT_LIMIT);
  });

  it("clamps an oversized limit to the max rather than rejecting it", () => {
    expect(clampLimit("10000")).toBe(LIMITS.LIST_MAX_LIMIT);
  });

  it("falls back to default for a non-numeric limit", () => {
    expect(clampLimit("abc")).toBe(LIMITS.LIST_DEFAULT_LIMIT);
  });

  it("defaults offset to 0 for negative or missing values", () => {
    expect(clampOffset(undefined)).toBe(0);
    expect(clampOffset("-5")).toBe(0);
  });

  it("accepts a valid offset", () => {
    expect(clampOffset("20")).toBe(20);
  });
});
