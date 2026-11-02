/**
 * A small JSON client for Ronit's API (api.ronitbarash.site). Every call carries the sign-in
 * cookie (credentials: "include"); the API answers errors as { status, code, message }.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The API's error code, like INVALID_CODE; NETWORK_ERROR when the server wasn't reached. */
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body?: unknown): Promise<T>;
  /** The full address of an API path, for a browser navigation (like "Continue with Google"). */
  url(path: string): string;
}

export interface ApiClientOptions {
  /** The API's origin, like https://api.ronitbarash.site. Empty: the page's own origin (the dev proxy). */
  baseUrl: string;
  fetch?: typeof fetch;
}

export function createApiClient({ baseUrl, fetch: fetchImpl }: ApiClientOptions): ApiClient {
  const origin = baseUrl.replace(/\/+$/, "");
  // Called through a wrapper: window.fetch throws "Illegal invocation" when detached.
  const send: typeof fetch = fetchImpl ?? ((input, init) => fetch(input, init));

  async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await send(`${origin}${path}`, {
        method,
        credentials: "include",
        headers: body === undefined ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, "NETWORK_ERROR", "The server can't be reached");
    }
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = (data ?? {}) as { code?: string; message?: string };
      throw new ApiError(response.status, error.code ?? "HTTP_ERROR", error.message ?? response.statusText);
    }
    return data as T;
  }

  return {
    get: (path) => call("GET", path),
    // Always a JSON body, so the server's JSON parser and the Origin check see a normal request.
    post: (path, body = {}) => call("POST", path, body),
    url: (path) => `${origin}${path}`,
  };
}
