/**
 * Minimal leveled logger. LOG_LEVEL=error|warn|info|debug (default info);
 * anything below the level is dropped. Use instead of bare console.log so
 * production stays quiet and tests can silence info noise.
 */
type Level = "error" | "warn" | "info" | "debug";

const ORDER: Record<Level, number> = { error: 0, warn: 1, info: 2, debug: 3 };

function activeLevel(): Level {
  const v = (process.env.LOG_LEVEL ?? "info").toLowerCase();
  if (v === "error" || v === "warn" || v === "info" || v === "debug") return v;
  return "info";
}

function emit(level: Level, event: Record<string, unknown>): void {
  if (ORDER[level] > ORDER[activeLevel()]) return;
  const line = JSON.stringify({ level, ...event });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export function logInfo(event: Record<string, unknown>): void {
  emit("info", event);
}

export function logWarn(event: Record<string, unknown>): void {
  emit("warn", event);
}

export function logError(event: Record<string, unknown>): void {
  emit("error", event);
}

export function logDebug(event: Record<string, unknown>): void {
  emit("debug", event);
}
