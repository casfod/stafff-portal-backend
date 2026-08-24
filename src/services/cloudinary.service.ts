// src/services/cloudinary.service.ts
import { v2 as cloudinary, UploadApiResponse, UploadApiErrorResponse } from "cloudinary";
import streamifier from "streamifier";
import { File } from "../models/File.model";
import { env } from "../config/env";
import { tryCatch } from "../utils/tryCatch";
import mongoose from "mongoose";
import { AppError } from "../utils/AppError";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
});

// ─── Types ────────────────────────────────────────────────────────────────────
export interface UploadOptions {
  folder: string;
  publicId?: string;
  resourceType?: "image" | "video" | "raw" | "auto";
  transformation?: object[];
  existingPublicId?: string;
  allowedFormats?: string[];
  maxSize?: number;
  useFilename?: boolean;
  uniqueFilename?: boolean;
}

export interface UploadResult {
  url: string;
  publicId: string;
  format: string;
  resourceType: string;
  size: number;
  width?: number;
  height?: number;
  duration?: number;
  _id?: string;
}

export interface AssociatedTo {
  model: string;
  id: mongoose.Types.ObjectId | string;
}

// ─── Folder Structure ────────────────────────────────────────────────────────
export const FOLDERS = {
  // User content
  avatars: "casfod/users/avatars",
  signatures: "casfod/users/signatures", // ✅ Added dedicated signatures folder
  
  // Documents by type
  pdfs: "casfod/documents/pdfs",
  docs: "casfod/documents/docs",
  spreadsheets: "casfod/documents/spreadsheets",
  presentations: "casfod/documents/presentations",
  
  // Images
  images: "casfod/images",
  
  // Request attachments
  requests: "casfod/requests",
  
  // Project files
  projects: "casfod/projects",
  
  // Videos
  videos: "casfod/videos",
  
  // Other/fallback
  others: "casfod/others",
} as const;

// ─── File Extension to Folder Mapping ──────────────────────────────────────
const EXTENSION_TO_FOLDER: Record<string, string> = {
  // PDFs
  'pdf': FOLDERS.pdfs,
  
  // Word documents
  'doc': FOLDERS.docs,
  'docx': FOLDERS.docs,
  
  // Spreadsheets
  'xls': FOLDERS.spreadsheets,
  'xlsx': FOLDERS.spreadsheets,
  'csv': FOLDERS.spreadsheets,
  
  // Presentations
  'ppt': FOLDERS.presentations,
  'pptx': FOLDERS.presentations,
  
  // Images
  'jpg': FOLDERS.images,
  'jpeg': FOLDERS.images,
  'png': FOLDERS.images,
  'gif': FOLDERS.images,
  'webp': FOLDERS.images,
  'svg': FOLDERS.images,
  'bmp': FOLDERS.images,
  'ico': FOLDERS.images,
  'tiff': FOLDERS.images,
  
  // Videos
  'mp4': FOLDERS.videos,
  'avi': FOLDERS.videos,
  'mov': FOLDERS.videos,
  'wmv': FOLDERS.videos,
  'flv': FOLDERS.videos,
  'mkv': FOLDERS.videos,
  'webm': FOLDERS.videos,
};

// ─── MIME Type to Extension Mapping ────────────────────────────────────────
const MIME_TO_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-msvideo': 'avi',
};

// ─── Transformation Presets ─────────────────────────────────────────────────
const TRANSFORMS = {
  avatar: [
    { width: 400, height: 400, crop: "fill", gravity: "face" },
    { quality: "auto", fetch_format: "auto" },
  ],
  signature: [
    { quality: "auto", fetch_format: "auto" },
    { width: 800, crop: "scale" }, // ✅ Preserve aspect ratio, limit size
  ],
  image: [
    { quality: "auto", fetch_format: "auto" },
  ],
  document: [
    { quality: "auto:good", fetch_format: "auto" },
  ],
  video: [
    { quality: "auto", fetch_format: "auto" },
  ],
} as const;

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Get the file extension from a filename or MIME type
 */
function getFileExtension(filename: string, mimeType?: string): string {
  // Try to get from filename first
  const match = filename.match(/\.([^./]+)$/);
  if (match) {
    return match[1].toLowerCase();
  }
  
  // Fallback to MIME type
  if (mimeType && MIME_TO_EXTENSION[mimeType]) {
    return MIME_TO_EXTENSION[mimeType];
  }
  
  // Default fallback
  return 'bin';
}

/**
 * Get the appropriate folder for a file based on its extension
 */
function getFolderForFile(filename: string, mimeType?: string): string {
  const ext = getFileExtension(filename, mimeType);
  return EXTENSION_TO_FOLDER[ext] || FOLDERS.others;
}

/**
 * Get the resource type for Cloudinary
 */
function getResourceType(mimeType?: string, ext?: string): "image" | "video" | "raw" {
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
  }
  
  if (ext) {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'];
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'];
    
    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
  }
  
  return 'raw';
}

/**
 * Get the file type for frontend display
 */
function getFileType(mimeType?: string, ext?: string): 'image' | 'pdf' | 'spreadsheet' | 'document' | 'video' | 'other' {
  if (mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return 'spreadsheet';
    if (mimeType.includes('document') || mimeType.includes('word')) return 'document';
  }
  
  if (ext) {
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff'];
    const videoExts = ['mp4', 'avi', 'mov', 'wmv', 'flv', 'mkv', 'webm'];
    const spreadsheetExts = ['xls', 'xlsx', 'csv'];
    const documentExts = ['doc', 'docx'];
    
    if (imageExts.includes(ext)) return 'image';
    if (videoExts.includes(ext)) return 'video';
    if (ext === 'pdf') return 'pdf';
    if (spreadsheetExts.includes(ext)) return 'spreadsheet';
    if (documentExts.includes(ext)) return 'document';
  }
  
  return 'other';
}

/**
 * Sanitize filename for Cloudinary
 */
function sanitizeFilename(name: string): string {
  return name
    .replace(/\.[^/.]+$/, '') // Remove extension
    .replace(/[^a-zA-Z0-9_-]/g, '_') // Replace special chars with underscore
    .substring(0, 60); // Truncate to 60 chars
}

// ─── Service ──────────────────────────────────────────────────────────────────
class CloudinaryService {
  /**
   * Upload a buffer to Cloudinary
   */
  private uploadBuffer(
    buffer: Buffer,
    options: UploadOptions
  ): Promise<UploadApiResponse> {
    return new Promise((resolve, reject) => {
      // Build options - let Cloudinary handle public_id generation
      const uploadOptions: any = {
        resource_type: options.resourceType ?? "image",
        folder: options.folder,
        overwrite: true,
        use_filename: options.useFilename ?? true,
        unique_filename: options.uniqueFilename ?? true,
      };

      // Only add public_id if explicitly provided (e.g., for avatars)
      if (options.publicId) {
        uploadOptions.public_id = options.publicId;
      }

      // Add transformation if provided
      if (options.transformation) {
        uploadOptions.transformation = options.transformation;
      }

      // For raw uploads, specify format explicitly
      if (options.resourceType === "raw" && options.publicId) {
        const ext = options.publicId.split('.').pop();
        if (ext) uploadOptions.format = ext;
      }

      // console.log('📤 Cloudinary upload options:', JSON.stringify(uploadOptions, null, 2));

      const stream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error: UploadApiErrorResponse | undefined, result: UploadApiResponse | undefined) => {
          if (error) {
            console.error('[Cloudinary] Upload error:', error);
            return reject(new AppError(`Upload failed: ${error.message}`, 500));
          }
          if (!result) {
            return reject(new AppError('Upload failed - no result', 500));
          }
          
          // console.log('✅ Cloudinary upload success:', {
          //   public_id: result.public_id,
          //   secure_url: result.secure_url,
          //   resource_type: result.resource_type,
          //   format: result.format,
          //   bytes: result.bytes,
          // });
          
          resolve(result);
        }
      );
      
      streamifier.createReadStream(buffer).pipe(stream);
    });
  }

  /**
   * Destroy/delete an asset from Cloudinary
   */
  async destroy(
    publicId: string,
    resourceType: "image" | "video" | "raw" = "image"
  ): Promise<{ result: string }> {
    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: resourceType,
      });
      // console.log(`🗑️ Cloudinary destroy result for ${publicId}:`, result);
      return result;
    } catch (err) {
      console.error(`[Cloudinary] destroy failed for ${publicId}:`, err);
      return { result: 'error' };
    }
  }

  /**
   * Generic upload method - handles all file types with automatic folder detection
   */
  async upload(
    buffer: Buffer,
    originalName: string,
    options: Partial<UploadOptions> = {},
    userId?: string,
    associatedTo?: AssociatedTo,
    mimeType?: string
  ): Promise<UploadResult> {
    return tryCatch(async () => {
      // Get file extension and determine folder
      const ext = getFileExtension(originalName, mimeType);
      const folder = options.folder || getFolderForFile(originalName, mimeType);
      const resourceType = options.resourceType || getResourceType(mimeType, ext);
      const fileType = getFileType(mimeType, ext);
      
      // Validate file size
      const maxSize = options.maxSize || 20 * 1024 * 1024;
      if (buffer.length > maxSize) {
        throw new AppError(`File size exceeds ${maxSize / 1024 / 1024}MB limit`, 413);
      }

      // Validate format
      if (options.allowedFormats && !options.allowedFormats.includes(ext)) {
        throw new AppError(
          `File format not allowed. Allowed: ${options.allowedFormats.join(', ')}`,
          415
        );
      }

      // Convert resourceType for destroy method (can't be 'auto')
      const destroyResourceType = resourceType === 'auto' ? 'image' : resourceType;

      // Destroy old asset if requested
      if (options.existingPublicId) {
        await this.destroy(options.existingPublicId, destroyResourceType as 'image' | 'video' | 'raw');
      }

      // Only pass publicId if explicitly provided (for avatars, etc.)
      const uploadOptions: UploadOptions = {
        folder,
        resourceType,
        transformation: options.transformation,
        useFilename: options.useFilename ?? true,
        uniqueFilename: options.uniqueFilename ?? true,
        maxSize: options.maxSize,
        allowedFormats: options.allowedFormats,
      };

      // Only pass publicId if explicitly provided (for avatars, etc.)
      if (options.publicId) {
        uploadOptions.publicId = options.publicId;
      }

      // Get transformation based on resource type if not provided
      if (!uploadOptions.transformation) {
        if (resourceType === 'image') {
          uploadOptions.transformation = TRANSFORMS.image as unknown as object[];
        } else if (resourceType === 'video') {
          uploadOptions.transformation = TRANSFORMS.video as unknown as object[];
        } else {
          uploadOptions.transformation = TRANSFORMS.document as unknown as object[];
        }
      }

      // console.log('📤 Uploading to Cloudinary:', {
      //   folder,
      //   resourceType,
      //   originalName,
      //   fileType,
      //   hasPublicId: !!options.publicId,
      // });

      // Upload to Cloudinary
      const result = await this.uploadBuffer(buffer, uploadOptions);

      // ✅ FIXED: No unnecessary URL cleaning
      const uploadResult: UploadResult = {
        url: result.secure_url, // ✅ No replace, no trim of quotes
        publicId: result.public_id,
        format: result.format || ext,
        resourceType: result.resource_type,
        size: result.bytes,
        width: result.width,
        height: result.height,
        duration: (result as any).duration,
      };

      // console.log('✅ Upload result:', {
      //   url: uploadResult.url,
      //   publicId: uploadResult.publicId,
      //   format: uploadResult.format,
      //   size: uploadResult.size,
      // });

      // Persist File record
      const fileDoc = await File.create({
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        format: uploadResult.format,
        resourceType: uploadResult.resourceType,
        size: uploadResult.size,
        originalName,
        folder,
        userId: userId ? new mongoose.Types.ObjectId(userId) : undefined,
        associatedTo: associatedTo
          ? {
              model: associatedTo.model,
              id: new mongoose.Types.ObjectId(associatedTo.id as string),
            }
          : undefined,
        metadata: {
          width: uploadResult.width,
          height: uploadResult.height,
          duration: uploadResult.duration,
        },
        mimeType: mimeType || '',
        fileType,
        name: originalName,
        cloudinaryId: result.public_id,
      });

      return {
        ...uploadResult,
        _id: String(fileDoc._id),
      };
    });
  }

  /**
   * Upload a user avatar
   */
  async uploadAvatar(
    buffer: Buffer,
    userId: string,
    existingPublicId?: string
  ): Promise<UploadResult> {
    return this.upload(
      buffer,
      `avatar_${userId}`,
      {
        folder: FOLDERS.avatars,
        publicId: `user_${userId}_${Date.now()}`,
        transformation: TRANSFORMS.avatar as unknown as object[],
        existingPublicId,
        resourceType: "image",
        allowedFormats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
        maxSize: 5 * 1024 * 1024, // 5MB
      },
      userId,
      { model: "User", id: userId },
      "image/jpeg"
    );
  }

  /**
   * ✅ NEW: Upload a user signature with proper image handling
   */
  async uploadSignature(
    buffer: Buffer,
    userId: string,
    existingPublicId?: string
  ): Promise<UploadResult> {
    return this.upload(
      buffer,
      `signature_${userId}`,
      {
        folder: FOLDERS.signatures, // ✅ Dedicated signatures folder
        publicId: `signature_${userId}_${Date.now()}`, // ✅ Unique ID
        resourceType: "image", // ✅ Force image type
        allowedFormats: ['png', 'jpg', 'jpeg', 'webp'],
        maxSize: 5 * 1024 * 1024, // 5MB
        existingPublicId,
        transformation: TRANSFORMS.signature as unknown as object[], // ✅ Signature-specific transform
      },
      userId,
      { model: "User", id: userId },
      "image/png" // ✅ Force PNG for transparency
    );
  }

  /**
   * Upload a file for a project
   */
  async uploadProjectFile(
    buffer: Buffer,
    projectId: string,
    fileName: string,
    userId?: string,
    mimeType?: string
  ): Promise<UploadResult> {
    return this.upload(
      buffer,
      fileName,
      {
        folder: FOLDERS.projects,
        maxSize: 20 * 1024 * 1024, // 20MB
      },
      userId,
      { model: "Projects", id: projectId },
      mimeType
    );
  }

  /**
   * Upload a request attachment
   */
  async uploadRequestFile(
    buffer: Buffer,
    requestId: string,
    fileName: string,
    requestType: string,
    userId?: string,
    mimeType?: string
  ): Promise<UploadResult> {
    return this.upload(
      buffer,
      fileName,
      {
        folder: `${FOLDERS.requests}/${requestType}`,
        maxSize: 20 * 1024 * 1024,
      },
      userId,
      { model: requestType, id: requestId },
      mimeType
    );
  }

  /**
   * Upload multiple files
   */
  async uploadMultiple(
    files: Array<{ buffer: Buffer; originalname: string; mimetype: string }>,
    userId?: string,
    associatedTo?: AssociatedTo,
    folder?: string
  ): Promise<UploadResult[]> {
    const results = [];
    for (const file of files) {
      const result = await this.upload(
        file.buffer,
        file.originalname,
        { folder },
        userId,
        associatedTo,
        file.mimetype
      );
      results.push(result);
    }
    return results;
  }

  /**
   * Get file by ID
   */
  async getFileById(fileId: string): Promise<any> {
    return tryCatch(async () => {
      const file = await File.findById(fileId);
      if (!file) throw new AppError('File not found', 404);
      return file;
    });
  }

  /**
   * Soft delete a file
   */
  async deleteFile(fileId: string): Promise<void> {
    return tryCatch(async () => {
      const file = await File.findById(fileId);
      if (!file) throw new AppError('File not found', 404);

      // Delete from Cloudinary
      await this.destroy(file.publicId, file.resourceType as 'image' | 'video' | 'raw');

      // Soft delete for audit trail
      file.isDeleted = true;
      file.deletedAt = new Date();
      await file.save();
    });
  }

  /**
   * Permanently delete a file
   */
  async deleteFilePermanent(fileId: string): Promise<void> {
    return tryCatch(async () => {
      const file = await File.findById(fileId);
      if (!file) throw new AppError('File not found', 404);

      await this.destroy(file.publicId, file.resourceType as 'image' | 'video' | 'raw');
      await File.findByIdAndDelete(fileId);
    });
  }

  /**
   * Update file metadata
   */
  async updateFileMetadata(
    fileId: string,
    updates: { name?: string; description?: string }
  ): Promise<any> {
    return tryCatch(async () => {
      const file = await File.findById(fileId);
      if (!file) throw new AppError('File not found', 404);

      if (updates.name) file.name = updates.name;
      if (updates.description) file.description = updates.description;
      await file.save();
      return file;
    });
  }

  /**
   * Get files for an entity
   */
  async getFilesForEntity(model: string, entityId: string): Promise<any[]> {
    return tryCatch(async () => {
      return File.find({
        'associatedTo.model': model,
        'associatedTo.id': new mongoose.Types.ObjectId(entityId),
        isDeleted: { $ne: true },
      })
        .sort('-createdAt')
        .lean();
    });
  }

  /**
   * Get files for a user
   */
  async getFilesForUser(userId: string): Promise<any[]> {
    return tryCatch(async () => {
      return File.find({
        userId: new mongoose.Types.ObjectId(userId),
        isDeleted: { $ne: true },
      })
        .sort('-createdAt')
        .lean();
    });
  }

  /**
   * Get file count for an entity
   */
  async getFileCountForEntity(model: string, entityId: string): Promise<number> {
    return File.countDocuments({
      'associatedTo.model': model,
      'associatedTo.id': new mongoose.Types.ObjectId(entityId),
      isDeleted: { $ne: true },
    });
  }

  /**
   * Generate a signed URL for private assets
   */
  generateSignedUrl(
    publicId: string,
    options: { expiresAt?: number; transformation?: object } = {}
  ): string {
    return cloudinary.url(publicId, {
      secure: true,
      sign_url: true,
      expires_at: options.expiresAt ?? Math.floor(Date.now() / 1000) + 3600,
      ...options.transformation,
    });
  }

  /**
   * Generate a thumbnail URL for images
   */
  getThumbnailUrl(publicId: string, width: number = 200, height: number = 200): string {
    return cloudinary.url(publicId, {
      secure: true,
      transformation: [
        { width, height, crop: "fill", gravity: "center" },
        { quality: "auto", fetch_format: "auto" },
      ],
    });
  }
}

export const cloudinaryService = new CloudinaryService();