import "@wterm/dom/css";
import { WTerm } from "@wterm/dom";
import { type TmuxPane, type TmuxSnapshot, type TmuxWindow } from "utils";
import "./style.css";

type CaptureResult = {
  target: string;
  ansi: string;
  lines: number;
  terminal: {
    rows: number;
    columns: number;
    cursorRow: number;
    cursorColumn: number;
  };
};

const apiBase = import.meta.env.VITE_API_BASE ?? "";
const configuredToken = import.meta.env.VITE_TMUAPP_TOKEN as string | undefined;
const apiTokenStorageKey = "tmuapp.apiToken";
const apiLabel = apiBase || "same-origin / Vite proxy";
const app = document.querySelector<HTMLDivElement>("#app")!;

const state: {
  snapshot?: TmuxSnapshot;
  activeSession?: string;
  activeWindow?: string;
  activePane?: string;
  terminal?: WTerm;
  terminalReady?: Promise<WTerm>;
  refreshTimer?: number;
  resizeTimer?: number;
  lastResize?: string;
} = {};

app.innerHTML = `
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">tm</span>
      <div>
        <h1>tmuapp</h1>
        <p>tmux fleet control</p>
      </div>
    </div>
    <nav class="actions" aria-label="Global actions">
      <button class="icon-button" id="refresh" type="button" title="Refresh sessions" aria-label="Refresh sessions">R</button>
      <button class="ghost" id="api-token" type="button">Token</button>
      <button class="primary" id="new-session" type="button">New session</button>
    </nav>
  </header>
  <main class="workspace">
    <aside class="rail" aria-label="Sessions">
      <div class="panel-heading">
        <span>Sessions</span>
        <small id="session-count">0</small>
      </div>
      <div id="sessions" class="session-list"></div>
    </aside>
    <section class="main-pane">
      <div class="window-strip" id="windows" role="tablist" aria-label="Windows"></div>
      <div class="terminal-shell">
        <div class="terminal-toolbar">
          <div>
            <strong id="active-title">No pane selected</strong>
            <span id="active-meta"></span>
          </div>
          <div class="terminal-actions">
            <button class="ghost" id="split-h" type="button">Split H</button>
            <button class="ghost" id="split-v" type="button">Split V</button>
            <button class="danger" id="kill-window" type="button">Kill window</button>
          </div>
        </div>
        <div id="terminal" class="terminal" aria-label="tmux pane terminal"></div>
        <form class="input-row" id="input-form">
          <input id="pane-input" name="input" autocomplete="off" placeholder="Send literal input to selected pane" />
          <button class="primary" type="submit">Send</button>
          <button class="ghost" id="enter-key" type="button">Enter</button>
        </form>
      </div>
    </section>
    <aside class="inspector" aria-label="Panes">
      <div class="panel-heading">
        <span>Panes</span>
        <small id="pane-count">0</small>
      </div>
      <div id="panes" class="pane-list"></div>
      <section class="metrics">
        <h2>Renderer</h2>
        <dl>
          <div><dt>Mode</dt><dd>wterm ANSI</dd></div>
          <div><dt>Fit</dt><dd id="fit-size">pending</dd></div>
          <div><dt>API</dt><dd>${apiLabel}</dd></div>
        </dl>
      </section>
    </aside>
  </main>
`;

wireEvents();
await refresh();
state.refreshTimer = window.setInterval(refreshActivePane, 2_000);

function wireEvents() {
  document
    .querySelector<HTMLButtonElement>("#refresh")!
    .addEventListener("click", () => void refresh());
  document
    .querySelector<HTMLButtonElement>("#new-session")!
    .addEventListener("click", () => void createSession());
  document
    .querySelector<HTMLButtonElement>("#api-token")!
    .addEventListener("click", configureApiToken);
  document
    .querySelector<HTMLButtonElement>("#kill-window")!
    .addEventListener("click", () => void killActiveWindow());
  document
    .querySelector<HTMLButtonElement>("#enter-key")!
    .addEventListener("click", () => void sendKeys(["Enter"]));
  document
    .querySelector<HTMLButtonElement>("#split-h")!
    .addEventListener("click", () => void splitPane("-h"));
  document
    .querySelector<HTMLButtonElement>("#split-v")!
    .addEventListener("click", () => void splitPane("-v"));
  document.querySelector<HTMLFormElement>("#input-form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = document.querySelector<HTMLInputElement>("#pane-input")!;
    void sendInput(input.value);
    input.value = "";
  });
  window.addEventListener("resize", fitTerminal);
}

async function refresh() {
  try {
    state.snapshot = await request<TmuxSnapshot>("/api/sessions");
    const firstSession = state.snapshot.sessions[0]?.id;
    state.activeSession =
      chooseExisting(
        state.activeSession,
        state.snapshot.sessions.map((session) => session.id),
      ) ?? firstSession;
    state.activeWindow =
      chooseExisting(
        state.activeWindow,
        currentWindows().map((window) => window.id),
      ) ?? currentWindows()[0]?.id;
    state.activePane =
      chooseExisting(
        state.activePane,
        currentPanes().map((pane) => pane.id),
      ) ?? currentPanes()[0]?.id;
    renderNavigation();
    await refreshActivePane();
  } catch (error) {
    renderTerminalText(`Unable to reach API at ${apiLabel}\n${message(error)}`);
  }
}

async function refreshActivePane() {
  if (!state.activePane) {
    renderTerminalText("No tmux pane selected. Create or attach to a session to begin.");
    return;
  }

  const capture = await request<CaptureResult>(
    `/api/panes/${encodeURIComponent(state.activePane)}/capture?lines=240`,
  );
  await renderTerminal(capture);
}

function renderNavigation() {
  const sessions = state.snapshot?.sessions ?? [];
  document.querySelector("#session-count")!.textContent = String(sessions.length);
  document.querySelector("#pane-count")!.textContent = String(currentPanes().length);

  document.querySelector("#sessions")!.innerHTML = sessions
    .map(
      (session) => `
        <button class="session-item ${session.id === state.activeSession ? "selected" : ""}" data-session="${escapeHtml(session.id)}" type="button">
          <span>${escapeHtml(session.name)}</span>
          <small>${session.windows} windows ${session.attached ? "attached" : "detached"}</small>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll<HTMLButtonElement>("[data-session]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeSession = button.dataset.session;
      state.activeWindow = currentWindows()[0]?.id;
      state.activePane = currentPanes()[0]?.id;
      renderNavigation();
      void refreshActivePane();
    });
  });

  document.querySelector("#windows")!.innerHTML = currentWindows()
    .map(
      (window) => `
        <button class="window-tab ${window.id === state.activeWindow ? "selected" : ""}" data-window="${escapeHtml(window.id)}" role="tab" type="button">
          <span>${window.index}:${escapeHtml(window.name)}</span>
          <small>${window.panes}</small>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll<HTMLButtonElement>("[data-window]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeWindow = button.dataset.window;
      state.activePane = currentPanes()[0]?.id;
      renderNavigation();
      void refreshActivePane();
    });
  });

  document.querySelector("#panes")!.innerHTML = currentPanes()
    .map(
      (pane) => `
        <button class="pane-item ${pane.id === state.activePane ? "selected" : ""}" data-pane="${escapeHtml(pane.id)}" type="button">
          <span>${escapeHtml(pane.title || pane.currentCommand || pane.id)}</span>
          <small>${pane.width}x${pane.height} ${escapeHtml(pane.currentPath)}</small>
        </button>
      `,
    )
    .join("");

  document.querySelectorAll<HTMLButtonElement>("[data-pane]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activePane = button.dataset.pane;
      renderNavigation();
      void refreshActivePane();
    });
  });

  const activePane = currentPanes().find((pane) => pane.id === state.activePane);
  document.querySelector("#active-title")!.textContent =
    activePane?.title || activePane?.currentCommand || "No pane selected";
  document.querySelector("#active-meta")!.textContent = activePane
    ? `${activePane.id} ${activePane.width}x${activePane.height} ${activePane.currentPath}`
    : "";
}

async function renderTerminal(capture: CaptureResult) {
  if (!state.terminal) {
    const element = document.querySelector<HTMLDivElement>("#terminal")!;
    state.terminal = new WTerm(element, {
      autoResize: true,
      cols: capture.terminal.columns || 120,
      cursorBlink: true,
      rows: capture.terminal.rows || 34,
      onData: (data) => void sendTerminalData(data),
      onResize: scheduleResizeActivePane,
    });
    state.terminalReady = state.terminal.init();
  }

  await state.terminalReady;
  state.terminal.write("\x1b[2J\x1b[H");
  state.terminal.write(capture.ansi.replaceAll("\n", "\r\n"));
  state.terminal.write(cursorPosition(capture));
  updateFitLabel();
}

function renderTerminalText(text: string) {
  void renderTerminal({
    target: state.activePane ?? "",
    ansi: text,
    lines: text.split("\n").length,
    terminal: { rows: 34, columns: 120, cursorRow: 0, cursorColumn: 0 },
  });
}

function fitTerminal() {
  if (state.terminal && state.activePane) {
    updateFitLabel();
    scheduleResizeActivePane(state.terminal.cols, state.terminal.rows);
  }
}

function scheduleResizeActivePane(columns: number, rows: number) {
  if (!state.activePane) {
    return;
  }

  const key = String(columns) + "x" + String(rows);
  if (state.lastResize === key) {
    return;
  }

  if (state.resizeTimer) {
    window.clearTimeout(state.resizeTimer);
  }

  state.resizeTimer = window.setTimeout(() => {
    state.resizeTimer = undefined;
    void resizeActivePane(columns, rows);
  }, 150);
}

async function createSession() {
  const name = prompt("Session name", `work-${Math.floor(Date.now() / 1000)}`);
  if (!name) {
    return;
  }

  await request("/api/sessions", { method: "POST", body: { name } });
  await refresh();
}

async function killActiveWindow() {
  if (!state.activeWindow || !confirm(`Kill window ${state.activeWindow}?`)) {
    return;
  }

  await request(`/api/windows/${encodeURIComponent(state.activeWindow)}`, { method: "DELETE" });
  await refresh();
}

async function splitPane(direction: "-h" | "-v") {
  if (!state.activePane) {
    return;
  }

  await request(`/api/panes/${encodeURIComponent(state.activePane)}/split`, {
    method: "POST",
    body: { direction: direction === "-h" ? "horizontal" : "vertical" },
  });
  await refresh();
}

async function sendInput(data: string) {
  if (!state.activePane || data.length === 0) {
    return;
  }

  await request(`/api/panes/${encodeURIComponent(state.activePane)}/input`, {
    method: "POST",
    body: { data },
  });
  await refreshActivePane();
}

async function sendTerminalData(data: string) {
  if (!state.activePane || data.length === 0) {
    return;
  }

  const chunks = data.split(/(\r)/u).filter(Boolean);
  for (const chunk of chunks) {
    if (chunk === "\r") {
      await sendKeys(["Enter"]);
    } else {
      await request(`/api/panes/${encodeURIComponent(state.activePane)}/input`, {
        method: "POST",
        body: { data: chunk },
      });
    }
  }

  await refreshActivePane();
}

async function sendKeys(keys: string[]) {
  if (!state.activePane) {
    return;
  }

  await request(`/api/panes/${encodeURIComponent(state.activePane)}/keys`, {
    method: "POST",
    body: { keys },
  });
  await refreshActivePane();
}

async function resizeActivePane(columns: number, rows: number) {
  if (!state.activePane) {
    return;
  }

  const key = String(columns) + "x" + String(rows);
  if (state.lastResize === key) {
    return;
  }

  state.lastResize = key;
  updateFitLabel();
  await request(`/api/panes/${encodeURIComponent(state.activePane)}/resize`, {
    method: "POST",
    body: { width: columns, height: rows },
  }).catch(() => {
    state.lastResize = undefined;
  });
}

function updateFitLabel() {
  if (!state.terminal) {
    return;
  }

  document.querySelector("#fit-size")!.textContent =
    `${state.terminal.cols}x${state.terminal.rows}`;
}

function cursorPosition(capture: CaptureResult) {
  const row = clamp(capture.terminal.cursorRow, 0, Math.max(capture.terminal.rows - 1, 0));
  const column = clamp(capture.terminal.cursorColumn, 0, Math.max(capture.terminal.columns - 1, 0));

  return `\x1b[${row + 1};${column + 1}H`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function currentWindows(): TmuxWindow[] {
  return state.activeSession && state.snapshot
    ? (state.snapshot.windows[state.activeSession] ?? [])
    : [];
}

function currentPanes(): TmuxPane[] {
  return state.activeWindow && state.snapshot
    ? (state.snapshot.panes[state.activeWindow] ?? [])
    : [];
}

function chooseExisting(current: string | undefined, candidates: string[]) {
  return current && candidates.includes(current) ? current : undefined;
}

async function request<T>(
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

function configureApiToken() {
  const current = localStorage.getItem(apiTokenStorageKey) ?? "";
  const next = prompt("API token", current);
  if (next === null) {
    return;
  }

  if (next.trim()) {
    localStorage.setItem(apiTokenStorageKey, next.trim());
  } else {
    localStorage.removeItem(apiTokenStorageKey);
  }

  void refresh();
}

function requestHeaders(hasBody: boolean) {
  const headers: Record<string, string> = {};
  if (hasBody) {
    headers["Content-Type"] = "application/json";
  }

  const token = configuredToken?.trim() || localStorage.getItem(apiTokenStorageKey)?.trim();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return Object.keys(headers).length ? headers : undefined;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
