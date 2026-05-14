export const apiBase = import.meta.env.VITE_API_BASE ?? "";
export const configuredToken = import.meta.env.VITE_TMUAPP_TOKEN as string | undefined;
export const apiTokenStorageKey = "tmuapp.apiToken";
export const apiLabel = apiBase || "same-origin / Vite proxy";

export async function request<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    method: init.method ?? "GET",
    headers: requestHeaders(init.body !== undefined),
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  if (!response.ok) {
    throw new Error((await response.text()) || response.statusText);
  }

  return (await response.json()) as T;
}

export function streamUrl(path: string) {
  const base = apiBase ? new URL(apiBase, window.location.href) : new URL(window.location.href);
  base.protocol = base.protocol === "https:" ? "wss:" : "ws:";
  base.pathname = path;
  base.search = "";
  const token = apiToken();
  if (token) {
    base.searchParams.set("token", token);
  }
  return base.toString();
}

export function apiToken() {
  return configuredToken?.trim() || localStorage.getItem(apiTokenStorageKey)?.trim() || "";
}

function requestHeaders(hasBody: boolean) {
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  const token = apiToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return Object.keys(headers).length ? headers : undefined;
}
