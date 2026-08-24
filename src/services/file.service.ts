// src/services/file.service.ts - No changes needed, but here's the complete file for reference
import { v2 as cloudinary } from 'cloudinary';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { env } from '../config/env';
import { File } from '../models/File.model';
import { AppError } from '../utils/AppError';
import { tryCatch } from '../utils/tryCatch';
import { cloudinaryService, FOLDERS, UploadResult as CloudinaryUploadResult } from './cloudinary.service';

// ─── Config ───────────────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key:    env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE    = 20 * 1024 * 1024;
const ALLOWED_IMAGES   = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOCS     = ['application/pdf'];
const CLOUD_NAMESPACE  = 'casfod';
const PUBLIC_DOWNLOAD_DEFAULT_TTL = 7 * 24 * 60 * 60;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface UploadOptions {
  buffer:       Buffer;
  originalname: string;
  mimetype:     string;
  size:         number;
  userId?:      string;
  folder?:      string;
  associatedTo?: { model: string; id: string };
  description?: string;
}

export interface UploadResult {
  _id: string;
  id: string;
  url: string;
  publicId: string;
  format: string;
  resourceType: string;
  size: number;
  originalName: string;
  folder: string;
  metadata?: { width?: number; height?: number; duration?: number };
  name?: string;
  mimeType?: string;
  fileType?: string;
  description?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getFolderByMimeType(mimetype: string): string {
  if (ALLOWED_IMAGES.includes(mimetype)) return 'images';
  if (mimetype === 'application/pdf') return 'documents/pdf';
  if (mimetype.includes('spreadsheet') || mimetype.includes('excel')) return 'documents/spreadsheets';
  if (mimetype.includes('document') || mimetype.includes('word')) return 'documents';
  return 'others';
}

function getResourceType(mimetype: string): 'image' | 'video' | 'raw' {
  if (mimetype.startsWith('image/')) return 'image';
  if (mimetype.startsWith('video/')) return 'video';
  return 'raw';
}

function mapFileDoc(f: any): UploadResult {
  return {
    _id: f._id.toString(),
    id: f._id.toString(),
    url: f.url,
    publicId: f.publicId,
    format: f.format,
    resourceType: f.resourceType,
    size: f.size,
    originalName: f.originalName,
    folder: f.folder,
    metadata: f.metadata,
    name: f.name || f.originalName,
    mimeType: f.mimeType,
    fileType: f.fileType,
    description: f.description,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────
class FileService {
  async uploadFile(opts: UploadOptions): Promise<UploadResult> {
    return tryCatch(async () => {
      this.validate(opts.mimetype, opts.size);

      const folder = opts.folder ?? getFolderByMimeType(opts.mimetype);
      const resourceType = getResourceType(opts.mimetype);

      // console.log('📤 FileService.uploadFile:', {
      //   originalname: opts.originalname,
      //   mimetype: opts.mimetype,
      //   size: opts.size,
      //   folder: `${CLOUD_NAMESPACE}/${folder}`,
      //   resourceType,
      // });

      const result = await cloudinaryService.upload(
        opts.buffer,
        opts.originalname,
        {
          folder: `${CLOUD_NAMESPACE}/${folder}`,
          resourceType,
          maxSize: MAX_FILE_SIZE,
          useFilename: true,
          uniqueFilename: true,
        },
        opts.userId,
        opts.associatedTo,
        opts.mimetype
      );

      return {
        _id: result._id!,
        id: result._id!,
        url: result.url,
        publicId: result.publicId,
        format: result.format,
        resourceType: result.resourceType,
        size: result.size,
        originalName: opts.originalname,
        folder: opts.folder || getFolderByMimeType(opts.mimetype),
        metadata: {
          width: result.width,
          height: result.height,
          duration: result.duration,
        },
        name: opts.originalname,
        mimeType: opts.mimetype,
        description: opts.description,
      };
    });
  }

  async uploadFiles(files: UploadOptions[]): Promise<UploadResult[]> {
    return tryCatch(async () => {
      const results = [];
      for (const file of files) {
        const result = await this.uploadFile(file);
        results.push(result);
      }
      return results;
    });
  }

  async handleFileUploads(
    files: Express.Multer.File[],
    documentId: string,
    modelName: string,
    userId?: string,
  ): Promise<UploadResult[]> {
    const results = [];
    for (const file of files) {
      const result = await this.uploadFile({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        userId,
        associatedTo: { model: modelName, id: documentId },
      });
      results.push(result);
    }
    return results;
  }

  async getFilesByModel(modelName: string, documentId: string): Promise<UploadResult[]> {
    return tryCatch(async () => {
      const files = await File.find({
        'associatedTo.model': modelName,
        'associatedTo.id': documentId,
        isDeleted: { $ne: true },
      })
        .sort('-createdAt')
        .lean();

      return files.map(mapFileDoc);
    });
  }

  async getFilesByModelBatch(modelName: string, documentIds: string[]): Promise<Map<string, UploadResult[]>> {
    return tryCatch(async () => {
      const map = new Map<string, UploadResult[]>();
      if (!documentIds.length) return map;

      const files = await File.find({
        'associatedTo.model': modelName,
        'associatedTo.id': { $in: documentIds },
        isDeleted: { $ne: true },
      })
        .sort('-createdAt')
        .lean();

      for (const f of files) {
        const docId = f.associatedTo?.id?.toString();
        if (!docId) continue;
        const mapped = mapFileDoc(f);
        const existing = map.get(docId);
        if (existing) existing.push(mapped);
        else map.set(docId, [mapped]);
      }

      return map;
    });
  }

  async getFilesByIds(ids: string[]): Promise<UploadResult[]> {
    return tryCatch(async () => {
      const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
      if (!validIds.length) return [];

      const files = await File.find({
        _id: { $in: validIds },
        isDeleted: { $ne: true },
      }).lean();

      return files.map(mapFileDoc);
    });
  }

  async getFileById(fileId: string): Promise<any> {
    return tryCatch(async () => {
      const file = await File.findById(fileId);
      if (!file) throw new AppError('File not found', 404);
      return file;
    });
  }

  async associateFile(
    fileId: string,
    modelName: string,
    documentId: string,
    _fieldName?: string,
  ): Promise<void> {
    return tryCatch(async () => {
      const updated = await File.findByIdAndUpdate(fileId, {
        associatedTo: { model: modelName, id: documentId },
      });
      if (!updated) throw new AppError('File not found', 404);
    });
  }

  async deleteFile(publicId: string): Promise<void> {
    return tryCatch(async () => {
      const file = await File.findOne({ publicId });
      if (!file) throw new AppError('File not found', 404);

      await cloudinaryService.destroy(
        file.publicId,
        file.resourceType as 'image' | 'video' | 'raw'
      );

      file.isDeleted = true;
      file.deletedAt = new Date();
      await file.save();
    });
  }

  async deleteFileById(fileId: string): Promise<void> {
    return tryCatch(async () => {
      const file = await File.findById(fileId);
      if (!file) throw new AppError('File not found', 404);

      await cloudinaryService.destroy(
        file.publicId,
        file.resourceType as 'image' | 'video' | 'raw'
      );

      file.isDeleted = true;
      file.deletedAt = new Date();
      await file.save();
    });
  }

  async deleteFilePermanent(fileId: string): Promise<void> {
    return tryCatch(async () => {
      const file = await File.findById(fileId);
      if (!file) throw new AppError('File not found', 404);

      await cloudinaryService.destroy(
        file.publicId,
        file.resourceType as 'image' | 'video' | 'raw'
      );
      await File.findByIdAndDelete(fileId);
    });
  }

  async deleteFilesByModel(modelName: string, documentId: string): Promise<void> {
    return tryCatch(async () => {
      const files = await File.find({
        'associatedTo.model': modelName,
        'associatedTo.id': documentId,
        isDeleted: { $ne: true },
      });

      for (const file of files) {
        await cloudinaryService.destroy(
          file.publicId,
          file.resourceType as 'image' | 'video' | 'raw'
        );
        file.isDeleted = true;
        file.deletedAt = new Date();
        await file.save();
      }
    });
  }

  async updateFileMetadata(
    fileId: string,
    updates: { name?: string; description?: string }
  ): Promise<any> {
    return tryCatch(async () => {
      const file = await File.findById(fileId);
      if (!file) throw new AppError('File not found', 404);

      if (updates.name) file.name = updates.name;
      if (updates.description !== undefined) file.description = updates.description;
      await file.save();
      return file;
    });
  }

  async getFilesForUser(userId: string): Promise<any[]> {
    return tryCatch(async () => {
      const files = await File.find({
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: { $ne: true },
      })
        .sort('-createdAt')
        .lean();

      return files.map((f) => ({ ...f, id: f._id.toString() }));
    });
  }

  async getFileCountForEntity(model: string, entityId: string): Promise<number> {
    return File.countDocuments({
      'associatedTo.model': model,
      'associatedTo.id': new mongoose.Types.ObjectId(entityId),
      isDeleted: { $ne: true },
    });
  }

  getSignedUrl(publicId: string, expiresInSeconds = 3600): string {
    return cloudinary.url(publicId, {
      sign_url: true,
      type: 'authenticated',
      expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    });
  }

  getThumbnailUrl(publicId: string, width: number = 200, height: number = 200): string {
    return cloudinary.url(publicId, {
      secure: true,
      transformation: [
        { width, height, crop: "fill", gravity: "center" },
        { quality: "auto", fetch_format: "auto" },
      ],
    });
  }

  private signDownloadToken(fileId: string, expiresAt: number): string {
    const secret = env.FILE_DOWNLOAD_SECRET;
    if (!secret) {
      throw new AppError(
        'FILE_DOWNLOAD_SECRET is not configured — public file download links cannot be generated',
        500
      );
    }
    return crypto.createHmac('sha256', secret).update(`${fileId}.${expiresAt}`).digest('hex');
  }

  generateFileDownloadToken(fileId: string, expiresInSeconds = PUBLIC_DOWNLOAD_DEFAULT_TTL): string {
    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const signature = this.signDownloadToken(fileId, expiresAt);
    return `${expiresAt}.${signature}`;
  }

  verifyFileDownloadToken(fileId: string, token: string | undefined | null): boolean {
    if (!token) return false;
    const [expiresAtStr, signature] = token.split('.');
    const expiresAt = Number(expiresAtStr);
    if (!expiresAt || !signature) return false;
    if (Math.floor(Date.now() / 1000) > expiresAt) return false;

    try {
      const expected = this.signDownloadToken(fileId, expiresAt);
      const a = Buffer.from(signature);
      const b = Buffer.from(expected);
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  getPublicDownloadUrl(fileId: string, expiresInSeconds = PUBLIC_DOWNLOAD_DEFAULT_TTL): string {
    const token = this.generateFileDownloadToken(fileId, expiresInSeconds);
    return `${env.API_BASE_URL}/files/public/${fileId}/download?token=${token}`;
  }

  private validate(mimetype: string, size: number): void {
    const allowed = [
      ...ALLOWED_IMAGES,
      ...ALLOWED_DOCS,
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'video/mp4',
      'video/mpeg',
      'video/quicktime',
    ];
    if (!allowed.includes(mimetype)) {
      throw new AppError(`File type '${mimetype}' is not allowed`, 415);
    }
    if (size > MAX_FILE_SIZE) {
      throw new AppError(`File exceeds ${MAX_FILE_SIZE / 1024 / 1024} MB`, 413);
    }
  }
}

export const fileService = new FileService();