/** Thin, typed fetch wrapper. All requests are same-origin (/api) with cookie auth + CSRF header. */

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
  get isAuth() {
    return this.status === 401;
  }
}

export function csrfToken(): string {
  const match = document.cookie.match(/(?:^|;\s*)aw_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

const NETWORK_ERROR = "Сервер недоступний. Перевірте з'єднання";

/** Raised to the app so it can redirect to login when the session expires. */
export const authEvents = new EventTarget();

export async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== "GET" && method !== "HEAD") headers.set("X-CSRF-Token", csrfToken());
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, method, headers, credentials: "same-origin" });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (!res.ok) {
    let detail = `Помилка ${res.status}`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* non-JSON error body: keep the generic message */
    }
    if (res.status === 401 && !path.startsWith("/auth/")) authEvents.dispatchEvent(new Event("expired"));
    throw new ApiError(res.status, detail);
  }
  return res;
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await request(path, init);
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => json<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => json<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => json<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: (path: string) => json<void>(path, { method: "DELETE" }),
};

/** Upload with real progress (fetch has no upload progress events). */
export function uploadFile<T>(path: string, file: File, onProgress: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api${path}`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-CSRF-Token", csrfToken());
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onerror = () => reject(new ApiError(0, NETWORK_ERROR));
    xhr.onload = () => {
      let body: { detail?: string } | T | undefined;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else reject(new ApiError(xhr.status, (body as { detail?: string })?.detail ?? `Помилка ${xhr.status}`));
    };
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Сталася невідома помилка";
}
