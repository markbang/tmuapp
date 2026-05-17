export type AgentState = "running" | "waiting_input" | "idle" | "unknown";

export type DetectedAgent = {
  state: AgentState;
  confidence: number;
  agent?: string;
};

/**
 * Detect agent state from currentCommand and last output text.
 * Priority: Codex > Claude Code > Aider > generic shell prompt.
 */
export function detectAgentState(currentCommand: string, lastOutput: string): DetectedAgent {
  const cmd = (currentCommand ?? "").toLowerCase();
  const out = lastOutput ?? "";
  const trimmed = out.trim();

  // ── Spinner frames used by Codex, Claude Code, pi ──
  if (/[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/.test(trimmed.slice(-20))) {
    return { state: "running", confidence: 0.85, agent: detectAgentName(cmd, out) };
  }

  // ── Explicit "Thinking…" / "Working…" ──
  if (/Thinking…|Working…|Processing…|Analyzing…/.test(out)) {
    return { state: "running", confidence: 0.8, agent: detectAgentName(cmd, out) };
  }

  // ── Claude Code tool-use markers ──
  if (/\b(Tool|function|bash)\b.*…/.test(trimmed)) {
    return { state: "running", confidence: 0.75, agent: "claude-code" };
  }

  // ── Aider prompt marker ──
  if (/>\s*$/.test(trimmed) && currentCommand?.includes("aider")) {
    return { state: "waiting_input", confidence: 0.75, agent: "aider" };
  }

  // ── Generic shell prompt ending with $, #, >, ❯ ──
  if (/[$#>❯]\s*$/.test(trimmed) && trimmed.length < 200) {
    // Check preceding lines for output activity
    const lines = out.split("\n");
    const recentLines = lines.slice(-5).filter((l) => l.trim());
    const hasRecentActivity = recentLines.some(
      (l) => /error|warning|fail|success|done|complete|written|created/i.test(l) || l.length > 30,
    );
    if (hasRecentActivity) {
      return { state: "idle", confidence: 0.6 };
    }
    return { state: "waiting_input", confidence: 0.7 };
  }

  // ── Empty or near-empty output ──
  if (!trimmed) {
    return { state: "idle", confidence: 0.5 };
  }

  return { state: "unknown", confidence: 0 };
}

function detectAgentName(cmd: string, output: string): string | undefined {
  if (cmd.includes("codex") || output.includes("Codex")) return "codex";
  if (cmd.includes("claude") || output.includes("Claude")) return "claude-code";
  if (cmd.includes("aider")) return "aider";
  if (cmd.includes("pi")) return "pi";
  return undefined;
}
