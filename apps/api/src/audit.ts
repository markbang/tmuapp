import { createHash } from "node:crypto";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Write a minimal audit entry to stderr (captured by Docker logs).
 * Logs high-risk write operations: input, keys, kill, resize, split, create.
 */
export function auditLog(action: string, target: string, token?: string) {
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    action,
    target,
    token: token ? hashToken(token).substring(0, 16) : "anonymous",
  });
  process.stderr.write(entry + "\n");
}
