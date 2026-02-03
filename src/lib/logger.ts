/**
 * Structured logging utility for the VPN server manager
 *
 * Features:
 * - Log levels (debug, info, warn, error)
 * - Structured data support
 * - Context/correlation ID support
 * - Vercel serverless compatible (console-based)
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private minLevel: LogLevel;
  private defaultContext: LogContext;

  constructor(minLevel: LogLevel = "info", defaultContext: LogContext = {}) {
    this.minLevel = minLevel;
    this.defaultContext = defaultContext;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  private formatError(error: unknown): LogEntry["error"] | undefined {
    if (!error) return undefined;

    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return {
      name: "UnknownError",
      message: String(error),
    };
  }

  private log(
    level: LogLevel,
    message: string,
    context?: LogContext,
    error?: unknown
  ): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
    };

    const mergedContext = { ...this.defaultContext, ...context };
    if (Object.keys(mergedContext).length > 0) {
      entry.context = mergedContext;
    }

    const formattedError = this.formatError(error);
    if (formattedError) {
      entry.error = formattedError;
    }

    // Format output for console - JSON for structured logging
    const output = JSON.stringify(entry);

    switch (level) {
      case "debug":
        console.debug(output);
        break;
      case "info":
        console.info(output);
        break;
      case "warn":
        console.warn(output);
        break;
      case "error":
        console.error(output);
        break;
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext, error?: unknown): void {
    this.log("warn", message, context, error);
  }

  error(message: string, context?: LogContext, error?: unknown): void {
    this.log("error", message, context, error);
  }

  /**
   * Create a child logger with additional default context
   */
  child(context: LogContext): Logger {
    const childLogger = new Logger(this.minLevel, {
      ...this.defaultContext,
      ...context,
    });
    return childLogger;
  }
}

// Determine log level from environment
function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  if (
    envLevel === "debug" ||
    envLevel === "info" ||
    envLevel === "warn" ||
    envLevel === "error"
  ) {
    return envLevel;
  }
  // Default to 'debug' in development, 'info' in production
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

// Export singleton logger instance
export const logger = new Logger(getLogLevel());

// Export factory for creating child loggers with context
export function createLogger(context: LogContext): Logger {
  return logger.child(context);
}

// Convenience loggers for common modules
export const loggers = {
  api: createLogger({ module: "api" }),
  bot: createLogger({ module: "bot" }),
  xui: createLogger({ module: "xui" }),
  db: createLogger({ module: "db" }),
  cron: createLogger({ module: "cron" }),
  service: createLogger({ module: "service" }),
};
