import winston from 'winston';
import { env } from '../config/env';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

winston.addColors(colors);

const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

const transports = [
  new winston.transports.Console(),
  new winston.transports.File({
    filename: path.join(logDir, 'error.log'),
    level: 'error',
  }),
  new winston.transports.File({ 
    filename: path.join(logDir, 'all.log') 
  }),
];

// Add file rotation for production
if (env.NODE_ENV === 'production') {
  // You can add rotation here if needed
}

export const logger = winston.createLogger({
  level: env.LOG_LEVEL || 'info',
  levels,
  format,
  transports,
});

// Export a stream for morgan integration
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};