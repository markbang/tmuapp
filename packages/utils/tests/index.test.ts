import { describe, expect, test } from "vite-plus/test";
import {
  parsePanes,
  parseSessions,
  parseWindows,
  sanitizeTarget,
  tmuxFormats,
} from "../src/index.ts";

describe("tmux format helpers", () => {
  test("exports stable list formats", () => {
    expect(tmuxFormats.sessions).toContain("#{session_id}");
    expect(tmuxFormats.windows).toContain("#{window_layout}");
    expect(tmuxFormats.panes).toContain("#{pane_current_path}");
  });
});

describe("tmux parsers", () => {
  test("parses session rows", () => {
    expect(parseSessions("$1|work|3|1|1778490000\n")).toEqual([
      { id: "$1", name: "work", windows: 3, attached: true, createdAt: 1778490000 },
    ]);
  });

  test("parses legacy tab-separated session rows", () => {
    expect(parseSessions("$1\twork\t3\t1\t1778490000\n")).toEqual([
      { id: "$1", name: "work", windows: 3, attached: true, createdAt: 1778490000 },
    ]);
  });

  test("parses window rows", () => {
    expect(
      parseWindows("@4\t2\tserver\t1\t2\tb25f,120x34,0,0{60x34,0,0,1,59x34,61,0,2}\n"),
    ).toEqual([
      {
        id: "@4",
        index: 2,
        name: "server",
        active: true,
        panes: 2,
        layout: "b25f,120x34,0,0{60x34,0,0,1,59x34,61,0,2}",
      },
    ]);
  });

  test("parses pane rows", () => {
    expect(parsePanes("%7|0|api|1|120|34|nvim|/home/bangwu/code/tmuapp\n")).toEqual([
      {
        id: "%7",
        index: 0,
        title: "api",
        active: true,
        width: 120,
        height: 34,
        currentCommand: "nvim",
        currentPath: "/home/bangwu/code/tmuapp",
      },
    ]);
  });
});

describe("target validation", () => {
  test("allows tmux ids and session names", () => {
    expect(sanitizeTarget("%10")).toBe("%10");
    expect(sanitizeTarget("work:1.0")).toBe("work:1.0");
  });

  test("rejects shell metacharacters", () => {
    expect(() => sanitizeTarget("work;rm -rf /")).toThrow("Invalid tmux target");
  });
});
