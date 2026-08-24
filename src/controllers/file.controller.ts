// src/controllers/file.controller.ts
import { Response } from 'express';
import { Readable } from 'stream';
import { catchAsync } from '../utils/catchAsync';
import { v2 as cloudinary } from 'cloudinary'; 
import { sendSuccess, sendCreated, sendNoContent } from '../utils/responseHandler';
import { AuthRequest } from '../middleware/auth.middleware';
import { currentUser, queryParams, userId, multerFiles } from './controller.helpers';
import { fileService } from '../services/file.service';
import { cloudinaryService, FOLDERS } from '../services/cloudinary.service';
import {
  assertCanManageDocumentFiles,
  assertCanAccessDocumentFiles,
} from '../services/document-ownership.service';
import { AppError } from '../utils/AppError';
import { env } from '../config/env';

// Configure Cloudinary for this controller
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

// ─── Helper: Cloudinary metadata response type ─────────────────────────────
interface CloudinaryResourceMetadata {
  secure_url?: string;
  url?: string;
  public_id?: string;
  resource_type?: string;
  bytes?: number;
  format?: string;
  created_at?: string;
  [key: string]: unknown;
}

// ─── Helper: Get extension from mime type ──────────────────────────────────
function getExtensionFromMimeType(mimeType?: string): string {
  if (!mimeType) return '';
  const mimeMap: Record<string, string> = {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
  };
  return mimeMap[mimeType] || '';
}

// ─── Helper: stream a file from Cloudinary to the response ─────────────────
async function streamFileDownload(file: any, res: Response): Promise<void> {
  let filename = file.originalName || file.name || 'download';
  const extension = file.format || getExtensionFromMimeType(file.mimeType);

  if (!/\.[^/.]+$/.test(filename) && extension) {
    filename += `.${extension}`;
  }

  const contentType = file.mimeType || 'application/octet-stream';

  try {
    // Method 1: Use Cloudinary URL with fl_attachment flag
    const downloadUrl = `${file.url}${file.url.includes('?') ? '&' : '?'}fl_attachment`;

    console.log('📥 Download URL:', downloadUrl);

    const upstream = await fetch(downloadUrl, {
      headers: { 'Accept': '*/*' },
    });

    // If we get 401/403, try the authenticated API endpoint
    if (upstream.status === 401 || upstream.status === 403) {
      console.log('🔄 Received 401/403, trying authenticated download...');

      const authUrl = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/resources/${file.resourceType || 'raw'}/upload/${file.publicId}`;
      const auth = Buffer.from(
        `${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`
      ).toString('base64');

      const authResponse = await fetch(authUrl, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json',
        },
      });

      if (!authResponse.ok) {
        throw new Error(`Auth fetch failed: ${authResponse.status}`);
      }

      const metadata = await authResponse.json() as CloudinaryResourceMetadata;

      let secureUrl = metadata.secure_url || metadata.url || '';
      if (secureUrl) {
        secureUrl = `${secureUrl}${secureUrl.includes('?') ? '&' : '?'}fl_attachment`;
      } else {
        throw new Error('No URL found in metadata');
      }

      console.log('🔄 Using authenticated URL:', secureUrl);

      const finalResponse = await fetch(secureUrl, {
        headers: { 'Accept': '*/*' },
      });

      if (!finalResponse.ok || !finalResponse.body) {
        throw new Error(`Final fetch failed: ${finalResponse.status}`);
      }

      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

      const contentLength = finalResponse.headers.get('content-length');
      if (contentLength) {
        res.setHeader('Content-Length', contentLength);
      }

      Readable.fromWeb(finalResponse.body as any).pipe(res);
      return;
    }

    // If the initial fetch succeeded
    if (!upstream.ok || !upstream.body) {
      throw new Error(`Fetch failed: ${upstream.status}`);
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);

    const upstreamContentLength = upstream.headers.get('content-length');
    if (upstreamContentLength) {
      res.setHeader('Content-Length', upstreamContentLength);
    }

    Readable.fromWeb(upstream.body as any).pipe(res);

  } catch (error) {
    console.error('❌ Download error:', error);

    // Final fallback: Use a basic authenticated request
    try {
      const auth = Buffer.from(
        `${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`
      ).toString('base64');

      const fallbackUrl = `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/raw/download/${file.publicId}`;

      const fallbackResponse = await fetch(fallbackUrl, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': '*/*',
        },
      });

      if (!fallbackResponse.ok || !fallbackResponse.body) {
        throw new Error(`Fallback failed: ${fallbackResponse.status}`);
      }

      const arrayBuffer = await fallbackResponse.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      res.set({
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
        'Content-Length': buffer.length,
      });

      res.send(buffer);
    } catch (finalError) {
      console.error('❌ Final fallback failed:', finalError);
      throw new AppError('Failed to download file. Please try again later.', 500);
    }
  }
}

// ── Upload file ──────────────────────────────────────────────────────────────
export const uploadFile = catchAsync(async (req: AuthRequest, res: Response) => {
  const files = multerFiles(req);
  if (!files || files.length === 0) {
    throw new AppError('No files uploaded', 400);
  }

  const { associatedModel, associatedId, folder, description } = req.body;

  if (associatedModel && associatedId) {
    await assertCanManageDocumentFiles(associatedModel, associatedId, currentUser(req));
  }

  const uploadOptions = files.map((file) => ({
    buffer: file.buffer,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    userId: userId(req),
    folder: folder || undefined,
    associatedTo:
      associatedModel && associatedId
        ? { model: associatedModel, id: associatedId }
        : undefined,
    description: description || undefined,
  }));

  const results = await fileService.uploadFiles(uploadOptions);

  sendCreated(res, results, 'Files uploaded successfully');
});

// ── Download file (authenticated) ────────────────────────────────────────────
export const downloadFile = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;

  const file = await fileService.getFileById(id);
  if (!file) {
    throw new AppError('File not found', 404);
  }

  if (file.associatedTo?.model && file.associatedTo?.id) {
    await assertCanAccessDocumentFiles(
      file.associatedTo.model,
      file.associatedTo.id.toString(),
      currentUser(req),
    );
  }

  await streamFileDownload(file, res);
});

// ── Download file (public, token-gated) ──────────────────────────────────────
export const downloadFilePublic = catchAsync(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const token = req.query.token as string | undefined;

  if (!fileService.verifyFileDownloadToken(id, token)) {
    throw new AppError('Invalid or expired download link', 403);
  }

  const file = await fileService.getFileById(id);
  if (!file) {
    throw new AppError('File not found', 404);
  }

  await streamFileDownload(file, res);
});

// ── Get file by ID ──────────────────────────────────────────────────────────
export const getFile = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await fileService.getFileById(req.params.id);
  sendSuccess(res, result, 'File retrieved successfully');
});

// ── Get files for entity ────────────────────────────────────────────────────
export const getFilesForEntity = catchAsync(async (req: AuthRequest, res: Response) => {
  const { model, id } = req.params;
  const { page, limit } = queryParams(req);

  await assertCanAccessDocumentFiles(model, id, currentUser(req));

  const files = await fileService.getFilesByModel(model, id);

  sendSuccess(res, { files }, 'Files retrieved successfully');
});

// ── Get files for current user ──────────────────────────────────────────────
export const getMyFiles = catchAsync(async (req: AuthRequest, res: Response) => {
  const files = await fileService.getFilesForUser(userId(req));
  sendSuccess(res, { files }, 'Your files retrieved successfully');
});

// ── Update file metadata ────────────────────────────────────────────────────
export const updateFile = catchAsync(async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body;

  const result = await fileService.updateFileMetadata(req.params.id, { name, description });
  sendSuccess(res, result, 'File updated successfully');
});

// ── Delete file (soft delete) ───────────────────────────────────────────────
export const deleteFile = catchAsync(async (req: AuthRequest, res: Response) => {
  const file = await fileService.getFileById(req.params.id);

  if (file.associatedTo?.model && file.associatedTo?.id) {
    await assertCanManageDocumentFiles(
      file.associatedTo.model,
      file.associatedTo.id.toString(),
      currentUser(req),
    );
  }

  await fileService.deleteFileById(req.params.id);
  sendNoContent(res);
});

// ── Delete file permanently ──────────────────────────────────────────────────
export const deleteFilePermanent = catchAsync(async (req: AuthRequest, res: Response) => {
  const file = await fileService.getFileById(req.params.id);

  if (file.associatedTo?.model && file.associatedTo?.id) {
    await assertCanManageDocumentFiles(
      file.associatedTo.model,
      file.associatedTo.id.toString(),
      currentUser(req),
    );
  }

  await fileService.deleteFilePermanent(req.params.id);
  sendNoContent(res);
});

// ── Upload user avatar ───────────────────────────────────────────────────────
export const uploadAvatar = catchAsync(async (req: AuthRequest, res: Response) => {
  const files = multerFiles(req);
  if (!files || files.length === 0) {
    throw new AppError('No image uploaded', 400);
  }

  const file = files[0];
  if (!file.mimetype.startsWith('image/')) {
    throw new AppError('Only images are allowed for avatar', 415);
  }

  const { User } = await import('../models');
  const user = await User.findById(userId(req));
  const existingPublicId = user?.avatar?.publicId;

  const result = await cloudinaryService.uploadAvatar(
    file.buffer,
    userId(req),
    existingPublicId,
  );

  await User.findByIdAndUpdate(userId(req), {
    avatar: { url: result.url, publicId: result.publicId },
  });

  sendSuccess(res, result, 'Avatar uploaded successfully');
});

// ── ✅ FIXED: Upload user Signature using dedicated method ───────────────────
export const uploadSignature = catchAsync(async (req: AuthRequest, res: Response) => {
  const files = multerFiles(req);
  if (!files || files.length === 0) {
    throw new AppError('No image uploaded', 400);
  }

  const file = files[0];
  if (!file.mimetype.startsWith('image/')) {
    throw new AppError('Only images are allowed for signature', 415);
  }

  const { User } = await import('../models');
  const user = await User.findById(userId(req));
  const existingPublicId = user?.signature?.publicId;

  // ✅ Use dedicated signature upload method with proper image handling
  const result = await cloudinaryService.uploadSignature(
    file.buffer,
    userId(req),
    existingPublicId,
  );

  // Update user's signature field
  await User.findByIdAndUpdate(userId(req), {
    signature: { url: result.url, publicId: result.publicId },
  });

  sendSuccess(res, result, 'Signature uploaded successfully');
});

// ── Remove avatar ────────────────────────────────────────────────────────────
export const removeAvatar = catchAsync(async (req: AuthRequest, res: Response) => {
  const { User } = await import('../models');
  const user = await User.findById(userId(req));
  if (!user) throw new AppError('User not found', 404);

  if (user.avatar?.publicId) {
    await cloudinaryService.destroy(user.avatar.publicId);
    user.avatar = { url: '', publicId: '' };
    await user.save();
  }

  sendSuccess(res, null, 'Avatar removed successfully');
});

// ── Remove Signature ────────────────────────────────────────────────────────────
export const removeSignature = catchAsync(async (req: AuthRequest, res: Response) => {
  const { User } = await import('../models');
  const user = await User.findById(userId(req));
  if (!user) throw new AppError('User not found', 404);

  if (user.signature?.publicId) {
    await cloudinaryService.destroy(user.signature.publicId);
    user.signature = { url: '', publicId: '' };
    await user.save();
  }

  sendSuccess(res, null, 'Signature removed successfully');
});

// ── ✅ NEW: Get signature as image (not download) ───────────────────────────
export const getSignature = catchAsync(async (req: AuthRequest, res: Response) => {
  const { User } = await import('../models');
  const user = await User.findById(userId(req));
  
  if (!user?.signature?.url) {
    throw new AppError('No signature found', 404);
  }

  // ✅ Set proper headers for signature images
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Cache-Control', 'public, max-age=3600');
  
  // Redirect to the Cloudinary URL
  res.redirect(user.signature.url);
});