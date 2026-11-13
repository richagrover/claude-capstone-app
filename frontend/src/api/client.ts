/**
 * Thin fetch wrapper. Base URL comes from VITE_API_BASE_URL (NFR-1: name only, no hardcoded
 * value). Non-2xx responses are surfaced as a typed ApiError the UI can render — never a raw
 * stack trace.
 */

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function getBaseUrl(): string {
  const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!baseUrl) {
    throw new Error(
      "VITE_API_BASE_URL is not configured. Set it in frontend/.env (see .env.example).",
    );
  }
  return baseUrl;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

function buildQueryString(query?: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const url = `${getBaseUrl()}${path}${buildQueryString(options.query)}`;

  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const data = (await response.json().catch(() => null)) as
    | T
    | { error: string; message: string }
    | null;

  if (!response.ok) {
    const errorBody = data as { error?: string; message?: string } | null;
    throw new ApiError(
      response.status,
      errorBody?.error ?? "unknown_error",
      errorBody?.message ?? "An unexpected error occurred.",
    );
  }

  return data as T;
}
