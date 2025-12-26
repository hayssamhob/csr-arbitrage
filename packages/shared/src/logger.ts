// Structured JSON logger
// Per llms.md: single-line JSON logs with service, event, ts, request_id

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  service: string;
  event: string;
  ts: string;
  request_id?: string;
  [key: string]: unknown;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private service: string;
  private minLevel: LogLevel;

  constructor(service: string, minLevel: LogLevel = 'info') {
    this.service = service;
    this.minLevel = minLevel;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.minLevel];
  }

  private formatLog(level: LogLevel, event: string, data?: Record<string, unknown>): string {
    const entry: LogEntry = {
      level,
      service: this.service,
      event,
      ts: new Date().toISOString(),
      ...data,
    };
    return JSON.stringify(entry);
  }

  debug(event: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatLog('debug', event, data));
    }
  }

  info(event: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('info')) {
      console.log(this.formatLog('info', event, data));
    }
  }

  warn(event: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatLog('warn', event, data));
    }
  }

  error(event: string, data?: Record<string, unknown>): void {
    if (this.shouldLog('error')) {
      console.error(this.formatLog('error', event, data));
    }
  }
}

export function createLogger(service: string): Logger {
  const level = (process.env.LOG_LEVEL || 'info') as LogLevel;
  return new Logger(service, level);
}
