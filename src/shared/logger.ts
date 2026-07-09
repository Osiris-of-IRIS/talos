/**
 * Structured logging utility (ADR-0002). Every record is a JSON-shaped object carrying
 * `decisionIds` (ADR references) and the running app version, so runtime behaviour stays
 * traceable back to the decision that authorized it. Console output styles warnings amber and
 * errors red, matching the in-app palette (ADR-0010). A capped in-memory ring buffer keeps the
 * most recent records for future in-app diagnostics (no rotating file handler — there is no
 * filesystem in a static, client-side app).
 */

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogRecord {
  timestamp: string;
  level: LogLevel;
  message: string;
  decisionIds: string[];
  version: string;
  context?: Record<string, unknown>;
}

export interface Logger {
  info(message: string, decisionIds: string[], context?: Record<string, unknown>): LogRecord;
  warn(message: string, decisionIds: string[], context?: Record<string, unknown>): LogRecord;
  error(message: string, decisionIds: string[], context?: Record<string, unknown>): LogRecord;
  getBuffer(): readonly LogRecord[];
}

const LOG_BUFFER_LIMIT = 200;

const CONSOLE_STYLE: Record<LogLevel, string> = {
  info: 'color:inherit',
  warn: 'color:#f59e0b;font-weight:600', // ADR-0010 warning amber
  error: 'color:#dc2626;font-weight:600', // ADR-0010 error/threat red
};

const CONSOLE_METHOD: Record<LogLevel, 'info' | 'warn' | 'error'> = {
  info: 'info',
  warn: 'warn',
  error: 'error',
};

export function createLogger(version: string): Logger {
  const buffer: LogRecord[] = [];

  function write(
    level: LogLevel,
    message: string,
    decisionIds: string[],
    context?: Record<string, unknown>,
  ): LogRecord {
    const record: LogRecord = {
      timestamp: new Date().toISOString(),
      level,
      message,
      decisionIds,
      version,
      ...(context ? { context } : {}),
    };

    buffer.push(record);
    if (buffer.length > LOG_BUFFER_LIMIT) {
      buffer.shift();
    }

    console[CONSOLE_METHOD[level]](`%c[TALOS] ${message}`, CONSOLE_STYLE[level], record);
    return record;
  }

  return {
    info: (message, decisionIds, context) => write('info', message, decisionIds, context),
    warn: (message, decisionIds, context) => write('warn', message, decisionIds, context),
    error: (message, decisionIds, context) => write('error', message, decisionIds, context),
    getBuffer: () => [...buffer],
  };
}

/** App-wide singleton logger, versioned from the build (T-025). */
export const logger = createLogger(__APP_VERSION__);
