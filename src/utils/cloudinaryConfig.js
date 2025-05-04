const cloudinary = require("cloudinary").v2;
const streamifier = require("streamifier");

// const { CloudinaryStorage } = require("multer-storage-cloudinary");
// const multer = require("multer");

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Get folder path based on file type
 * This organizes files in Cloudinary by type
 */
const getFolderByFileType = (fileType) => {
  switch (fileType) {
    case "image/jpeg":
    case "image/png":
    case "image/gif":
    case "image/webp":
      return "images";
    case "application/pdf":
      return "pdfs";
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.ms-excel":
      return "spreadsheets";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/msword":
      return "documents";
    default:
      return "other";
  }
};

/**
 * Map MIME type to our file type categories
 */
const getFileTypeFromMimeType = (mimeType) => {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return "spreadsheet";
  if (mimeType.includes("document") || mimeType.includes("word"))
    return "document";
  return "other";
};

/**
 * Direct Cloudinary upload function (without multer)
 * This allows us to upload file buffers directly to Cloudinary
 */
const uploadToCloudinary = async (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    // Convert buffer to stream and pipe to uploadStream
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

/**
 * Delete a file from Cloudinary by its public ID
 */
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result;
  } catch (error) {
    console.error(`❌ Cloudinary deletion failed:`, error);
  }
};

module.exports = {
  cloudinary,
  uploadToCloudinary,
  deleteFromCloudinary,
  getFolderByFileType,
  getFileTypeFromMimeType,
};
