// src/routes/file.routes.ts
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { protect, restrictTo } from '../middleware/auth.middleware';
import * as fileController from '../controllers/file.controller';

const router = Router();

// ── Multer configuration ────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 20 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    // For avatar, only images
    if (file.fieldname === 'avatar') {
      if (file.mimetype.startsWith('image/')) {
        cb(null, true);
      } else {
        cb(new Error('Only image files are allowed for avatar') as any, false);
      }
    } else {
      // For other files, allow common types
      const allowedTypes = [
        'image/jpeg', 'image/png', 'image/webp', 'image/gif',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'video/mp4',
      ];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} is not allowed`) as any, false);
      }
    }
  },
});

// ── Rate limiter for public (unauthenticated) downloads ─────────────────────
// Vendor-facing links carry a signed token instead of a JWT, so they're
// rate limited by IP. 20 requests / 15 minutes comfortably covers one
// vendor's team opening or retrying a link, without leaving the endpoint
// open to scraping every fileId in sequence.
const publicDownloadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      message: 'Too many download attempts. Please try again in 15 minutes.',
    });
  },
});

// ── Public route (no auth) — MUST stay above router.use(protect) below ─────
// Used for RFQ/PO vendor email links. Access control is the signed token
// (verified in the controller), not a session — see file.service.ts's
// generateFileDownloadToken/verifyFileDownloadToken.
router.get(
  '/public/:id/download',
  publicDownloadLimiter,
  fileController.downloadFilePublic
);

// ── All routes below require authentication ──────────────────────────────
router.use(protect);

// ── Avatar routes ───────────────────────────────────────────────────────────
// ✅ FIX: Remove debugRequest from avatar route - it interferes with multer
router.post(
  '/avatar',
  upload.single('avatar'),
  fileController.uploadAvatar
);
router.post(
  '/signature',
  upload.single('signature'),
  fileController.uploadSignature
);
router.delete('/signature', fileController.removeSignature);

// ── File upload routes ─────────────────────────────────────────────────────
router.post(
  '/upload',
  upload.array('files', 20),
  fileController.uploadFile
);

router.get('/:id/download', fileController.downloadFile);

// ── File management routes ─────────────────────────────────────────────────
router.get('/me', fileController.getMyFiles);
router.get('/:id', fileController.getFile);
router.patch('/:id', fileController.updateFile);

// Soft delete (any authenticated user can soft delete their own files)
router.delete('/:id', fileController.deleteFile);

// Permanent delete (admin/super-admin only)
router.delete(
  '/:id/permanent',
  restrictTo('ADMIN', 'SUPER-ADMIN'),
  fileController.deleteFilePermanent
);

// ── Get files by entity ────────────────────────────────────────────────────
router.get('/entity/:model/:id', fileController.getFilesForEntity);

export default router;