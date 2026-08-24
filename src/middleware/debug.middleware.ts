// src/middleware/debug.middleware.ts
import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

export const debugRequest = (label: string) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    console.log(`═══════════════════════════════════════════════════════════`);
    console.log(`🔍 DEBUG: ${label}`);
    console.log(`📌 Method: ${req.method}`);
    console.log(`📌 URL: ${req.originalUrl}`);
    console.log(`📌 Params:`, req.params);
    console.log(`📌 Query:`, req.query);
    
    // ✅ Don't log body for multipart/form-data requests - it breaks the stream
    const contentType = req.headers['content-type'] || '';
    if (contentType.includes('multipart/form-data')) {
      console.log(`📌 Body: <multipart/form-data - skipping>`);
      console.log(`📌 Files: ${req.file ? 'Has file' : 'None'}`);
      console.log(`📌 Files array: ${req.files ? 'Has files' : 'None'}`);
    } else {
      console.log(`📌 Body:`, JSON.stringify(req.body, null, 2));
    }
    
    console.log(`📌 User: ${req.user?._id || 'Unauthenticated'}`);
    console.log(`📌 Content-Type: ${contentType}`);
    console.log(`═══════════════════════════════════════════════════════════`);
    next();
  };
};