// src/config/upload.config.ts
import multer from 'multer';
import { Request } from 'express';

// Supported file types
export const ALLOWED_MIME_TYPES = {
  image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
  document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  spreadsheet: ['application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
};

export const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx', '.xls', '.xlsx'];

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

// File filter
export const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const ext = file.originalname.toLowerCase().match(/\.[0-9a-z]+$/)?.[0];
  if (ext && ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
  }
};

// Centralized multer instance
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: MAX_FILE_SIZE,
    files: 10, // Max files per request
  },
  fileFilter,
});

// Helper to handle multiple file fields
export const handleFileUpload = (fieldName: string = 'files', maxCount: number = 5) => {
  return upload.array(fieldName, maxCount);
};