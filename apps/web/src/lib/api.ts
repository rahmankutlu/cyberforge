/**
 * Typed fetch helpers for the CyberForge API.
 *
 * Server Components call the API service directly (API_INTERNAL_URL). Browser code uses
 * same-origin /api/v1 URLs, which Next.js proxies, so there is no CORS and the API never needs
 * to be reachable from the browser.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type QueryValue =
  string | number | boolean | null | undefined | readonly (string | number)[];
export type Query = Record<string, QueryValue>;

export function buildQuery(params?: Query): string {
  if (!params) return "";
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, String(item));
    } else {
      search.set(key, String(value));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

function baseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.API_INTERNAL_URL ?? "http://127.0.0.1:8000";
  }
  return "";
}

export function apiUrl(path: string, params?: Query): string {
  return `${baseUrl()}/api/v1${path}${buildQuery(params)}`;
}

function messageFrom(status: number, body: unknown): string {
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((d) =>
          d && typeof d === "object" && "msg" in d
            ? String((d as { msg: unknown }).msg)
            : String(d),
        )
        .join("; ");
    }
    if (detail && typeof detail === "object" && "message" in detail) {
      const d = detail as { message: string; errors?: string[] };
      return d.errors?.length ? `${d.message}: ${d.errors.join("; ")}` : d.message;
    }
  }
  return `Request failed (${status})`;
}

async function parse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  if (!response.ok) throw new ApiError(response.status, messageFrom(response.status, body), body);
  return body as T;
}

export async function apiGet<T>(path: string, params?: Query, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path, params), {
    cache: "no-store",
    ...init,
    headers: { Accept: "application/json", ...init?.headers },
  });
  return parse<T>(response);
}

export async function apiSend<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  params?: Query,
): Promise<T> {
  const response = await fetch(apiUrl(path, params), {
    method,
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(response);
}

/** Like apiGet, but returns null on 404 instead of throwing. */
export async function apiGetOrNull<T>(path: string, params?: Query): Promise<T | null> {
  try {
    return await apiGet<T>(path, params);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
