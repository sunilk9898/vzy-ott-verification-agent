// ============================================================================
// Structured Logger - Winston wrapper for agent system
// ============================================================================

import winston from 'winston';

const LOG_DIR = process.env.LOG_DIR || './logs';

export class Logger {
  private logger: winston.Logger;

  constructor(private context: string) {
    this.logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json(),
      ),
      defaultMeta: { service: 'vzy-agent', context },
      transports: [
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.printf(({ timestamp, level, message, context: ctx, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} [${level}] [${ctx || context}] ${message}${metaStr}`;
            }),
          ),
        }),
        new winston.transports.File({
          filename: `${LOG_DIR}/error.log`,
          level: 'error',
          maxsize: 10_000_000,
          maxFiles: 5,
        }),
        new winston.transports.File({
          filename: `${LOG_DIR}/combined.log`,
          maxsize: 50_000_000,
          maxFiles: 10,
        }),
      ],
    });
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.logger.info(message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.logger.warn(message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.logger.error(message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.logger.debug(message, meta);
  }
}
