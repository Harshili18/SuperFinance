export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" })
      .then((r) => r.ok)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const send = () =>
    fetch(`/api/v1${path}`, {
      ...init,
      credentials: "include",
      headers,
    });
  let res = await send();
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const ok = await tryRefresh();
    if (ok) res = await send();
    else {
      if (window.location.pathname !== "/login") window.location.href = "/login";
      throw new ApiError("Please sign in.", 401);
    }
  }
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new ApiError(detail, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export type Kpi = {
  value: number;
  previous?: number | null;
  change_pct?: number | null;
  direction?: string;
};

export type User = {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  role: string;
  theme: string;
  org_id: string;
};
