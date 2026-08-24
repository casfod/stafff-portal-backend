// validate.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodTypeAny, ZodObject, ZodArray, ZodOptional, ZodNullable, ZodDefault } from 'zod';
import { AppError } from '../utils/AppError';
import { Types } from 'mongoose';

/**
 * Unwraps .optional() / .nullable() / .default() so we can see the "real"
 * type underneath — e.g. z.array(x).optional() should still be treated as
 * an array field when deciding whether to JSON.parse it.
 */
function unwrap(type: ZodTypeAny): ZodTypeAny {
  if (type instanceof ZodOptional || type instanceof ZodNullable || type instanceof ZodDefault) {
    return unwrap(type._def.innerType);
  }
  return type;
}

/**
 * Checks if a string is a valid MongoDB ObjectId
 */
function isValidObjectId(id: string): boolean {
  return Types.ObjectId.isValid(id) && new Types.ObjectId(id).toString() === id;
}

/**
 * Normalizes reference fields (reviewedBy, approvedBy, project, etc.)
 * If the field is an object with an id property, extract just the id
 * If the field is a string, validate it's a valid ObjectId
 * If the field is null/undefined, leave as is
 */
function normalizeReferenceFields(body: Record<string, unknown>, schema: ZodObject<any>): Record<string, unknown> {
  const shape = schema.shape as Record<string, ZodTypeAny>;
  const normalized = { ...body };
  
  // List of fields that should be references (IDs)
  // You can make this configurable or derive from schema
  const referenceFields = ['reviewedBy', 'approvedBy', 'project', 'supervisorId', 'financeReviewBy', 'procurementReviewBy'];
  
  for (const field of referenceFields) {
    if (!(field in normalized)) continue;
    
    const value = normalized[field];
    
    // Skip null/undefined
    if (value === null || value === undefined) {
      continue;
    }
    
    // If it's an object with an id property, extract the id
    if (typeof value === 'object' && value !== null && 'id' in value) {
      const id = (value as any).id;
      if (typeof id === 'string' && isValidObjectId(id)) {
        normalized[field] = id;
      } else {
        // If the id is invalid, leave as is - Zod will validate
        continue;
      }
    }
    
    // If it's already a string, validate it's a valid ObjectId
    // Zod will handle the final validation
    if (typeof value === 'string') {
      // Optional: validate format here, but let Zod handle it
      continue;
    }
  }
  
  return normalized;
}

/**
 * multipart/form-data can only carry strings, so any object/array field
 * (itemGroups, periodOfActivity, etc.) arrives JSON-stringified. Before
 * handing the body to Zod, JSON.parse any field the schema expects to be
 * an object or array but that is still a raw string. JSON-body requests
 * (application/json) are unaffected since their fields are never strings
 * to begin with, so this is a no-op for them.
 */
function parseJsonFields(schema: ZodSchema, body: unknown): unknown {
  if (!(schema instanceof ZodObject) || body === null || typeof body !== 'object') {
    return body;
  }

  const shape = schema.shape as Record<string, ZodTypeAny>;
  const parsedBody: Record<string, unknown> = { ...(body as Record<string, unknown>) };

  for (const key of Object.keys(shape)) {
    const value = parsedBody[key];
    if (typeof value !== 'string') continue;

    const fieldType = unwrap(shape[key]);
    if (fieldType instanceof ZodObject || fieldType instanceof ZodArray) {
      try {
        parsedBody[key] = JSON.parse(value);
      } catch {
        // Leave it as-is — Zod will surface a clear
        // "Expected object/array, received string" error instead.
      }
    }
  }

  return parsedBody;
}

/**
 * Main validation middleware with reference field normalization
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    // Step 1: Parse JSON fields (for multipart/form-data)
    let body = parseJsonFields(schema, req.body);
    
    // Step 2: Normalize reference fields (extract IDs from objects)
    if (body && typeof body === 'object' && schema instanceof ZodObject) {
      body = normalizeReferenceFields(body as Record<string, unknown>, schema);
    }
    
    // Step 3: Validate with Zod
    const result = schema.safeParse(body);
    if (!result.success) {
      const errors = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
      throw new AppError(`Validation failed: ${errors}`, 400);
    }
    
    // Step 4: Assign validated data to req.body
    req.body = result.data;
    next();
  };
};