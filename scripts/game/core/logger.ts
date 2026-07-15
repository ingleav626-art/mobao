// 日志级别
type LogLevel = "debug" | "info" | "warn" | "error"
const LEVEL_PRIORITY: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 }

function getConfiguredLevel(): LogLevel {
  try {
    const stored = localStorage.getItem("mobao_log_level")
    if (stored === "debug" || stored === "info" || stored === "warn" || stored === "error") return stored
  } catch { /* ignore */ }
  return location.hostname === "localhost" ? "debug" : "warn"
}

function getConfiguredCategories(): Set<string> | null {
  try {
    const stored = localStorage.getItem("mobao_log_categories")
    if (!stored || stored === "all") return null
    return new Set(stored.split(","))
  } catch { return null }
}

export interface Logger {
  debug(msg: string, ...args: unknown[]): void
  info(msg: string, ...args: unknown[]): void
  warn(msg: string, ...args: unknown[]): void
  error(msg: string, ...args: unknown[]): void
}

export function createLogger(category: string): Logger {
  const log = (level: LogLevel, msg: string, args: unknown[]): void => {
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[getConfiguredLevel()]) return
    const cats = getConfiguredCategories()
    if (cats && !cats.has(category)) return
    const prefix = `[${level.toUpperCase()}][${category}]`
    const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log
    fn(prefix, msg, ...args)
  }
  return {
    debug: (msg, ...args) => log("debug", msg, args),
    info: (msg, ...args) => log("info", msg, args),
    warn: (msg, ...args) => log("warn", msg, args),
    error: (msg, ...args) => log("error", msg, args)
  }
}