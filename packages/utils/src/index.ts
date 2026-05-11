export type TmuxSession = {
  id: string;
  name: string;
  windows: number;
  attached: boolean;
  createdAt: number;
};

export type TmuxWindow = {
  id: string;
  index: number;
  name: string;
  active: boolean;
  panes: number;
  layout: string;
};

export type TmuxPane = {
  id: string;
  index: number;
  title: string;
  active: boolean;
  width: number;
  height: number;
  currentCommand: string;
  currentPath: string;
};

export type TmuxSnapshot = {
  sessions: TmuxSession[];
  windows: Record<string, TmuxWindow[]>;
  panes: Record<string, TmuxPane[]>;
};

const FIELD_SEPARATOR = "\t";

export const tmuxFormats = {
  sessions: [
    "#{session_id}",
    "#{session_name}",
    "#{session_windows}",
    "#{session_attached}",
    "#{session_created}",
  ].join(FIELD_SEPARATOR),
  windows: [
    "#{window_id}",
    "#{window_index}",
    "#{window_name}",
    "#{window_active}",
    "#{window_panes}",
    "#{window_layout}",
  ].join(FIELD_SEPARATOR),
  panes: [
    "#{pane_id}",
    "#{pane_index}",
    "#{pane_title}",
    "#{pane_active}",
    "#{pane_width}",
    "#{pane_height}",
    "#{pane_current_command}",
    "#{pane_current_path}",
  ].join(FIELD_SEPARATOR),
};

export function parseSessions(output: string): TmuxSession[] {
  return rows(output).map((row) => {
    const [id = "", name = "", windows = "0", attached = "0", createdAt = "0"] = row;

    return {
      id,
      name,
      windows: Number.parseInt(windows, 10) || 0,
      attached: attached === "1",
      createdAt: Number.parseInt(createdAt, 10) || 0,
    };
  });
}

export function parseWindows(output: string): TmuxWindow[] {
  return rows(output).map((row) => {
    const [id = "", index = "0", name = "", active = "0", panes = "0", layout = ""] = row;

    return {
      id,
      index: Number.parseInt(index, 10) || 0,
      name,
      active: active === "1",
      panes: Number.parseInt(panes, 10) || 0,
      layout,
    };
  });
}

export function parsePanes(output: string): TmuxPane[] {
  return rows(output).map((row) => {
    const [
      id = "",
      index = "0",
      title = "",
      active = "0",
      width = "0",
      height = "0",
      currentCommand = "",
      currentPath = "",
    ] = row;

    return {
      id,
      index: Number.parseInt(index, 10) || 0,
      title,
      active: active === "1",
      width: Number.parseInt(width, 10) || 0,
      height: Number.parseInt(height, 10) || 0,
      currentCommand,
      currentPath,
    };
  });
}

export function sanitizeTarget(value: string): string {
  if (!/^[%@$]?[A-Za-z0-9_.:/+-]+$/.test(value)) {
    throw new Error("Invalid tmux target");
  }

  return value;
}

function rows(output: string): string[][] {
  return output
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => line.split(FIELD_SEPARATOR));
}
