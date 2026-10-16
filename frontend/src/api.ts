export type School = {
  id: number;
  name: string;
  slug: string;
  logo: string | null;
  is_active: boolean;
  appearance: { accent?: string };
};
export type User = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: "admin" | "teacher" | null;
  must_change_password: boolean;
  is_platform_admin: boolean;
};
export type Session = {
  access: string;
  refresh: string;
  user: User;
  school: School | null;
  memberships: { school: School; role: string }[];
};
export type Row = { id: number; [key: string]: unknown };
export type Page<T> = {
  count: number;
  results: T[];
  next: string | null;
  previous: string | null;
};
const configured = (
  import.meta.env?.VITE_API_URL || "http://127.0.0.1:8000"
).replace(/\/$/, "");
export const API_BASE = configured.endsWith("/api")
  ? configured
  : `${configured}/api`;
const storageKey = "school_workspace_session";

export class APIError extends Error {
  fields: Record<string, string>;
  status: number;
  constructor(status: number, data: unknown) {
    const fields =
      data && typeof data === "object"
        ? Object.fromEntries(
            Object.entries(data).map(([key, value]) => [
              key,
              Array.isArray(value) ? value.join(" ") : String(value),
            ]),
          )
        : {};
    super(
      fields.detail ||
        fields.non_field_errors ||
        Object.values(fields)[0] ||
        "The request could not be completed. Try again.",
    );
    this.status = status;
    this.fields = fields;
  }
}

export function readSession(): Session | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(storageKey) || "null");
    return value?.access && value?.refresh && value?.user?.id
      ? (value as Session)
      : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null) {
  if (session) sessionStorage.setItem(storageKey, JSON.stringify(session));
  else sessionStorage.removeItem(storageKey);
}

/** School switching changes generation before any new context is established. */
export class APIClient {
  session: Session | null;
  private epoch = 0;
  private pending = new Set<AbortController>();
  private refreshing: Promise<void> | null = null;
  onSession: (session: Session | null) => void = () => undefined;

  constructor(session: Session | null) {
    this.session = session;
  }

  replaceSession(session: Session | null) {
    this.cancelPending();
    this.session = session;
    saveSession(session);
    this.onSession(session);
  }

  cancelPending() {
    this.epoch += 1;
    for (const controller of this.pending) controller.abort();
    this.pending.clear();
    this.refreshing = null;
  }

  private async refresh(expected: number) {
    if (!this.refreshing) {
      const original = this.session;
      this.refreshing = (async () => {
        const response = await fetch(`${API_BASE}/token/refresh/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh: original?.refresh }),
        });
        if (expected !== this.epoch)
          throw new DOMException("School changed", "AbortError");
        if (!response.ok || !original) {
          this.replaceSession(null);
          throw new APIError(401, {
            detail: "Your session ended. Please sign in again.",
          });
        }
        const tokens = (await response.json()) as {
          access: string;
          refresh: string;
        };
        if (expected !== this.epoch)
          throw new DOMException("School changed", "AbortError");
        this.session = { ...original, ...tokens };
        saveSession(this.session);
        this.onSession(this.session);
      })().finally(() => {
        if (expected === this.epoch) this.refreshing = null;
      });
    }
    await this.refreshing;
  }

  async request<T>(
    path: string,
    options: RequestInit = {},
    raw = false,
  ): Promise<T> {
    const expected = this.epoch;
    const originalSchool = this.session?.school?.id;
    const controller = new AbortController();
    this.pending.add(controller);
    const send = () => {
      const headers = new Headers(options.headers);
      headers.set("Accept-Language", document.documentElement.lang || "en");
      if (!(options.body instanceof FormData))
        headers.set("Content-Type", "application/json");
      if (this.session)
        headers.set("Authorization", `Bearer ${this.session.access}`);
      if (originalSchool) headers.set("X-School-ID", String(originalSchool));
      return fetch(`${API_BASE}/${path.replace(/^\//, "")}`, {
        ...options,
        headers,
        signal: controller.signal,
        cache: "no-store",
      });
    };
    try {
      let response = await send();
      if (
        response.status === 401 &&
        this.session &&
        !path.startsWith("login/")
      ) {
        await this.refresh(expected);
        if (expected !== this.epoch)
          throw new DOMException("School changed", "AbortError");
        response = await send();
      }
      if (expected !== this.epoch)
        throw new DOMException("School changed", "AbortError");
      if (!response.ok)
        throw new APIError(
          response.status,
          await response.json().catch(() => null),
        );
      if (response.status === 204) return undefined as T;
      const data = raw ? await response.blob() : await response.json();
      if (expected !== this.epoch)
        throw new DOMException("School changed", "AbortError");
      if (
        options.method &&
        options.method !== "GET" &&
        !path.startsWith("notifications/")
      )
        window.dispatchEvent(new Event("school-data-changed"));
      return data as T;
    } finally {
      this.pending.delete(controller);
    }
  }

  async switchSchool(school: number) {
    this.cancelPending();
    const session = await this.request<Session>("schools/", {
      method: "POST",
      body: JSON.stringify({ school_id: school }),
    });
    this.replaceSession(session);
  }
}

export const text = (value: unknown) => (value == null ? "" : String(value));
export const number = (value: unknown) => Number(value || 0);
export const list = (value: unknown): Row[] =>
  Array.isArray(value) ? (value as Row[]) : [];
export const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function allRows(
  api: APIClient,
  endpoint: string,
): Promise<Row[]> {
  const result: Row[] = [];
  for (let page = 1; ; page++) {
    const response = await api.request<Page<Row>>(
      `${endpoint}${endpoint.includes("?") ? "&" : "?"}page=${page}&page_size=100`,
    );
    result.push(...response.results);
    if (!response.next) return result;
  }
}
