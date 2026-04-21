// controllers/signatureController.js
const signatureService = require("../services/signatureService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");

/**
 * Upload signature for current user
 */
const uploadSignature = catchAsync(async (req, res) => {
  const currentUser = req.user;

  if (!req.file) {
    return handleResponse(res, 400, "No file uploaded");
  }

  const signature = await signatureService.uploadSignature(currentUser, {
    buffer: req.file.buffer,
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
  });

  // Populate file details for response
  const populatedSignature = await signature.populate("file");

  handleResponse(res, 200, "Signature uploaded successfully", {
    id: populatedSignature.id,
    imageUrl: populatedSignature.file?.url,
    uploadedAt: populatedSignature.uploadedAt,
  });
});

/**
 * Get current user's signature
 */
const getMySignature = catchAsync(async (req, res) => {
  const currentUser = req.user;
  const signature = await signatureService.getUserSignature(currentUser._id);

  if (!signature) {
    return handleResponse(res, 404, "No signature found for this user");
  }

  handleResponse(res, 200, "Signature retrieved successfully", signature);
});

/**
 * Delete current user's signature
 */
const deleteMySignature = catchAsync(async (req, res) => {
  const currentUser = req.user;
  await signatureService.deleteSignature(currentUser._id);
  handleResponse(res, 200, "Signature deleted successfully");
});

/**
 * Get signature for a specific user (admin only)
 */
const getUserSignature = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const signature = await signatureService.getUserSignature(userId);

  if (!signature) {
    return handleResponse(res, 404, "No signature found for this user");
  }

  handleResponse(res, 200, "Signature retrieved successfully", signature);
});

/**
 * Apply signature to a document
 */
const applySignatureToDocument = catchAsync(async (req, res) => {
  const currentUser = req.user;
  const { documentUrl, position } = req.body;

  if (!documentUrl) {
    return handleResponse(res, 400, "Document URL is required");
  }

  const signature = await signatureService.getUserSignature(currentUser._id);
  if (!signature) {
    return handleResponse(res, 404, "Please upload a signature first");
  }

  const pdfBuffer = await signatureService.applySignatureToPdf(
    documentUrl,
    signature.imageUrl,
    position
  );

  // Update last used timestamp
  await signatureService.updateLastUsed(currentUser._id);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="signed_document.pdf"'
  );
  res.send(pdfBuffer);
});

module.exports = {
  uploadSignature,
  getMySignature,
  deleteMySignature,
  getUserSignature,
  applySignatureToDocument,
};
