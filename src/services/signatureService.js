// services/signatureService.js
const Signature = require("../models/SignatureModel");
// const File = require("../models/FileModel");
const fileService = require("./fileService");

const sharp = require("sharp");

/**
 * Signature Service - Handles all signature operations
 */
class SignatureService {
  /**
   * Upload a signature for a user
   * @param {Object} user - The user object
   * @param {Object} fileData - File data including buffer and metadata
   * @returns {Object} - The created signature document
   */
  async uploadSignature(user, fileData) {
    const { buffer, originalname, mimetype, size } = fileData;

    // Validate file type - only images allowed for signatures
    const allowedImageTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
    ];
    if (!allowedImageTypes.includes(mimetype)) {
      throw new Error("Signature must be an image file (PNG, JPEG, or WEBP)");
    }

    // Validate file size (max 2MB)
    if (size > 2 * 1024 * 1024) {
      throw new Error("Signature image must be less than 2MB");
    }

    // Process the signature image - remove background and optimize
    const processedBuffer = await this.processSignatureImage(buffer, mimetype);

    // Create a file data object for fileService
    const processedFileData = {
      buffer: processedBuffer,
      originalname: `signature_${user.first_name}_${user.last_name}.png`,
      mimetype: "image/png",
      size: processedBuffer.length,
    };

    // Use fileService.uploadFile to handle Cloudinary upload and file record creation
    const savedFile = await fileService.uploadFile(processedFileData);

    // Check if user already has a signature
    const existingSignature = await Signature.findOne({
      user: user._id,
    }).populate("file");

    if (existingSignature) {
      // Delete old signature file using fileService
      await fileService.deleteFile(existingSignature.file._id);

      // Update existing signature with new file
      existingSignature.file = savedFile._id;
      existingSignature.uploadedAt = new Date();
      existingSignature.isActive = true;
      await existingSignature.save();
      return existingSignature;
    }

    // Create new signature
    const signature = new Signature({
      user: user._id,
      file: savedFile._id,
      uploadedAt: new Date(),
      isActive: true,
    });

    await signature.save();
    return signature;
  }

  /**
   * Process signature image - remove background and optimize
   * @param {Buffer} buffer - Original image buffer
   * @param {string} mimetype - Original mimetype
   * @returns {Buffer} - Processed image buffer with transparent background
   */
  async processSignatureImage(buffer, mimetype) {
    try {
      // Load the image with sharp
      let image = sharp(buffer);

      // Convert to PNG for transparency support
      const pngBuffer = await image.png().toBuffer();

      // Process the image: resize, optimize, make background transparent
      const processedBuffer = await sharp(pngBuffer)
        .resize(800, 400, { fit: "inside", withoutEnlargement: true })
        // Make white/light backgrounds transparent
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .png({ quality: 90, compressionLevel: 6, adaptiveFiltering: true })
        .toBuffer();

      return processedBuffer;
    } catch (error) {
      console.error("Error processing signature image:", error);
      // Return original buffer if processing fails
      return buffer;
    }
  }

  /**
   * Get user's signature
   * @param {string} userId - User ID
   * @returns {Object} - Signature document with file details
   */
  async getUserSignature(userId) {
    const signature = await Signature.findOne({ user: userId, isActive: true })
      .populate("file")
      .lean();

    if (!signature) {
      return null;
    }

    return {
      id: signature.id,
      imageUrl: signature.file?.url,
      uploadedAt: signature.uploadedAt,
      lastUsedAt: signature.lastUsedAt,
      settings: signature.settings,
    };
  }

  /**
   * Delete user's signature
   * @param {string} userId - User ID
   * @returns {boolean} - Whether deletion was successful
   */
  async deleteSignature(userId) {
    const signature = await Signature.findOne({ user: userId }).populate(
      "file"
    );

    if (!signature) {
      throw new Error("No signature found for this user");
    }

    // Use fileService to delete the file (handles Cloudinary and File record)
    await fileService.deleteFile(signature.file._id);

    // Delete signature record
    await Signature.findByIdAndDelete(signature._id);

    return true;
  }

  /**
   * Apply signature to a PDF document using fileService
   * @param {string} pdfUrl - URL of the PDF document
   * @param {string} signatureUrl - URL of the signature image
   * @param {Object} position - Position settings { x, y, width, page }
   * @returns {Buffer} - PDF buffer with signature applied
   */
  async applySignatureToPdf(pdfUrl, signatureUrl, position = {}) {
    const { x = 50, y = 85, width = 150, height = 60, page = -1 } = position;

    try {
      // Use fileService to generate signed PDF
      const pdfBuffer = await fileService.generateSignedPdf(
        { sourceUrl: pdfUrl, position: { x, y, width, height, page } },
        signatureUrl,
        { x, y, width, height }
      );
      return pdfBuffer;
    } catch (error) {
      console.error("Error applying signature to PDF:", error);
      throw new Error("Failed to apply signature to PDF: " + error.message);
    }
  }

  /**
   * Update signature usage timestamp
   * @param {string} userId - User ID
   */
  async updateLastUsed(userId) {
    await Signature.findOneAndUpdate(
      { user: userId },
      { lastUsedAt: new Date() }
    );
  }
}

module.exports = new SignatureService();

// services/signatureService.js - update the applySignatureToPdf method
// const { PDFDocument } = require('pdf-lib');
// const fetch = require('node-fetch');

// /**
//  * Apply signature to a PDF document using pdf-lib
//  * @param {string} pdfUrl - URL of the PDF document
//  * @param {string} signatureUrl - URL of the signature image
//  * @param {Object} position - Position settings { x, y, width, page }
//  * @returns {Buffer} - PDF buffer with signature applied
//  */
// async applySignatureToPdf(pdfUrl, signatureUrl, position = {}) {
//   const { x = 50, y = 50, width = 150, height = 60, pageNumber = 0 } = position;

//   try {
//     // Fetch the PDF
//     const pdfResponse = await fetch(pdfUrl);
//     const pdfBytes = await pdfResponse.arrayBuffer();

//     // Fetch the signature image
//     const signatureResponse = await fetch(signatureUrl);
//     const signatureBytes = await signatureResponse.arrayBuffer();

//     // Load the PDF document
//     const pdfDoc = await PDFDocument.load(pdfBytes);

//     // Embed the signature image
//     let signatureImage;
//     try {
//       signatureImage = await pdfDoc.embedPng(signatureBytes);
//     } catch {
//       // Try as JPEG if PNG fails
//       signatureImage = await pdfDoc.embedJpg(signatureBytes);
//     }

//     // Get the specified page (default to first page)
//     const pages = pdfDoc.getPages();
//     const targetPage = pages[pageNumber] || pages[0];

//     // Get page dimensions
//     const { width: pageWidth, height: pageHeight } = targetPage.getSize();

//     // Calculate position (convert percentage to absolute if needed)
//     const absoluteX = typeof x === 'number' && x <= 1 ? x * pageWidth : x;
//     const absoluteY = typeof y === 'number' && y <= 1 ? y * pageHeight : y;

//     // Draw the signature on the page
//     targetPage.drawImage(signatureImage, {
//       x: absoluteX,
//       y: absoluteY - height,
//       width,
//       height,
//     });

//     // Serialize the PDF to bytes
//     const modifiedPdfBytes = await pdfDoc.save();

//     return Buffer.from(modifiedPdfBytes);
//   } catch (error) {
//     console.error("Error applying signature to PDF:", error);
//     throw new Error("Failed to apply signature to PDF: " + error.message);
//   }
// }
