const File = require("../models/FileModel");
const FileAssociation = require("../models/FileAssociation");
const {
  uploadToCloudinary,
  deleteFromCloudinary,
  getFolderByFileType,
  getFileTypeFromMimeType,
} = require("../utils/cloudinaryConfig");
const {
  isAllowedFileType,
  generateSafeFilename,
} = require("../utils/fileUtils");

// Add to fileService.js
const PDFDocument = require("pdfkit");
const sharp = require("sharp");

/**
 * File Service - Handles all file operations
 */
class FileService {
  /**
   * Upload a file to Cloudinary and save metadata to MongoDB
   * @param {Object} fileData - File data including buffer and metadata
   * @returns {Object} - The created file document
   */
  async uploadFile(fileData) {
    const { buffer, originalname, mimetype, size } = fileData;

    // Validate file type
    if (!isAllowedFileType(mimetype)) {
      throw new Error("File type not allowed");
    }

    // Prepare upload options
    const folder = getFolderByFileType(mimetype);
    const fileType = getFileTypeFromMimeType(mimetype);
    const safeFilename = generateSafeFilename(originalname);

    // Upload to Cloudinary
    // const cloudinaryResult = await uploadToCloudinary(buffer, {
    //   folder,
    //   resource_type: "auto",
    //   public_id: safeFilename.split(".")[0],
    // });

    const cloudinaryResult = await uploadToCloudinary(buffer, {
      folder,
      resource_type: mimetype === "application/pdf" ? "raw" : "auto",
      public_id: safeFilename.split(".")[0],
    });

    // Save file metadata to MongoDB
    const newFile = new File({
      name: originalname,
      url: cloudinaryResult.secure_url,
      cloudinaryId: cloudinaryResult.public_id,
      mimeType: mimetype,
      size: size,
      fileType: fileType,
    });

    return await newFile.save();
  }

  /**
   * Associate a file with another model
   * @param {string} fileId - The ID of the file
   * @param {string} modelName - The name of the model to associate with
   * @param {string} documentId - The ID of the document
   * @param {string} fieldName - Optional field name for the association
   * @returns {Object} - The created association
   */
  async associateFile(fileId, modelName, documentId, fieldName = null) {
    // Verify the file exists
    const file = await File.findById(fileId);
    if (!file) {
      throw new Error("File not found");
    }

    // Create the association
    const association = new FileAssociation({
      file: fileId,
      model: modelName,
      documentId,
      fieldName,
    });

    return await association.save();
  }

  /**
   * Get a file by ID
   * @param {string} fileId - The ID of the file
   * @returns {Object} - The file document
   */
  async getFileById(fileId) {
    const file = await File.findById(fileId);
    if (!file) {
      throw new Error("File not found");
    }
    return file;
  }

  /**
   * Get all files associated with a document
   * @param {string} modelName - The name of the model
   * @param {string} documentId - The ID of the document
   * @param {string} fieldName - Optional field name to filter by
   * @returns {Array} - Array of file documents
   */
  async getFilesByDocument(modelName, documentId, fieldName = null) {
    // Build query
    const query = {
      model: modelName,
      documentId,
    };

    // Add fieldName to query if provided
    if (fieldName) {
      query.fieldName = fieldName;
    }

    // Find associations and populate file data
    const associations = await FileAssociation.find(query).populate("file");

    // Return the file objects
    return associations.map((assoc) => assoc.file);
  }

  /**
   * Update file metadata
   * @param {string} fileId - The ID of the file
   * @param {Object} updateData - The data to update
   * @returns {Object} - The updated file document
   */
  async updateFile(fileId, updateData) {
    const file = await File.findById(fileId);
    if (!file) {
      throw new Error("File not found");
    }

    // Only allow updating certain fields
    const allowedUpdates = ["name", "description"];
    Object.keys(updateData).forEach((key) => {
      if (allowedUpdates.includes(key)) {
        file[key] = updateData[key];
      }
    });

    file.updatedAt = new Date();
    return await file.save();
  }

  /**
   * Delete a file and its associations
   * @param {string} fileId - The ID of the file
   * @returns {boolean} - Whether the deletion was successful
   */
  async deleteFile(fileId) {
    const file = await File.findById(fileId);
    if (!file) {
      throw new Error("File not found");
    }

    // Delete from Cloudinary
    await deleteFromCloudinary(file.cloudinaryId);

    // Delete associations
    await FileAssociation.deleteMany({ file: fileId });

    // Delete file metadata from MongoDB
    await File.findByIdAndDelete(fileId);

    return true;
  }

  /**
   * Delete all files associated with a document
   * @param {string} modelName - The name of the model
   * @param {string} documentId - The ID of the document
   * @returns {number} - The number of files deleted
   */
  async deleteFilesByDocument(modelName, documentId) {
    // Retrieve file associations
    const associations = await FileAssociation.find({
      model: modelName,
      documentId,
    }).populate("file");

    if (!associations.length) {
      console.log("No associated files found for deletion.");
      return 0; // No files to delete
    }

    // Proceed with file deletion
    const deletionPromises = associations.map(async (assoc) => {
      if (assoc.file) {
        await deleteFromCloudinary(assoc.file.cloudinaryId);

        await File.findByIdAndDelete(assoc.file._id);
      }

      await FileAssociation.findByIdAndDelete(assoc._id);
    });

    await Promise.all(deletionPromises);

    return associations.length;
  }

  /**
   * Generate PDF with signature overlay
   * @param {Object} data - Document data (can include source PDF URL or content)
   * @param {string} signatureUrl - URL of signature image
   * @param {Object} signaturePosition - Position settings { x, y, width, height }
   * @returns {Buffer} - PDF buffer
   */
  async generateSignedPdf(data, signatureUrl, signaturePosition = {}) {
    const { x = 400, y = 700, width = 150, height = 60 } = signaturePosition;

    return new Promise(async (resolve, reject) => {
      try {
        const PDFDocument = require("pdfkit");
        const doc = new PDFDocument({ margin: 50, size: "A4" });
        const buffers = [];

        doc.on("data", buffers.push.bind(buffers));
        doc.on("end", () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });

        // Add document header
        doc.fontSize(16).text("SIGNED DOCUMENT", { align: "center" });
        doc.moveDown();
        doc
          .fontSize(12)
          .text(`Generated on: ${new Date().toLocaleDateString()}`);
        doc.moveDown();

        doc
          .fontSize(10)
          .text(
            "This document has been electronically signed by the authorized party."
          );
        doc.moveDown();

        // Add signature image if provided
        if (signatureUrl) {
          doc.moveDown();
          doc.fontSize(10).text("Signature:", { continued: false });

          // Fetch and add signature image
          const fetch = require("node-fetch");
          const response = await fetch(signatureUrl);
          const signatureBuffer = await response.buffer();

          doc.image(signatureBuffer, x, y, { width, height });
        }

        // Add footer
        const pageCount = doc.bufferedPageRange().count;
        for (let i = 0; i < pageCount; i++) {
          doc.switchToPage(i);
          doc
            .fontSize(8)
            .text(`Page ${i + 1} of ${pageCount}`, 50, doc.page.height - 50, {
              align: "center",
            });
        }

        doc.end();
      } catch (error) {
        console.error("Error generating signed PDF:", error);
        reject(error);
      }
    });
  }
}

module.exports = new FileService();
