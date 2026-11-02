import { NotFoundError } from "../services";
import { ApiError, type ApiClient } from "./client";

const BASE = "/api/dashboard";

export interface DashboardApi {
  /** `what` and `id` name the thing asked for, for the NotFoundError a 404 becomes. */
  get<T>(path: string, what?: string, id?: string): Promise<T>;
  post<T>(path: string, body?: unknown, what?: string, id?: string): Promise<T>;
}

/**
 * The dashboard API (/api/dashboard on Ronit's server, passed on by the dashboard's host). Every
 * answer is { status: "ok", data }; a 404 becomes the NotFoundError the screens recognise.
 */
export function dashboardApi(api: ApiClient): DashboardApi {
  async function unwrap<T>(call: Promise<{ data: T }>, what: string, id: string): Promise<T> {
    try {
      return (await call).data;
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) throw new NotFoundError(what, id);
      throw err;
    }
  }
  return {
    get: (path, what = "Item", id = "") => unwrap(api.get(`${BASE}${path}`), what, id),
    post: (path, body, what = "Item", id = "") => unwrap(api.post(`${BASE}${path}`, body), what, id),
  };
}

/** "?status=new&search=…" from the values that are set; "" when none are. */
export function queryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const segment = (id: string) => encodeURIComponent(id);
