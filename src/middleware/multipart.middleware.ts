// src/middleware/parseMultipart.middleware.ts
import { Request, Response, NextFunction } from 'express';

/**
 * Automatically parse JSON fields from multipart/form-data
 * Just list which fields are JSON strings
 */
export function parseJsonFields(fields: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    fields.forEach(field => {
      if (req.body[field] && typeof req.body[field] === 'string') {
        try {
          req.body[field] = JSON.parse(req.body[field]);
        } catch (e) {
          // Leave as string if not valid JSON
        }
      }
    });
    next();
  };
}