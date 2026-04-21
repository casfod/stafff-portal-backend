// routes/signatureRoutes.js
const express = require("express");
const multer = require("multer");
const signatureController = require("../controllers/signatureController");
const protect = require("../middleware/protect");
const restrictTo = require("../middleware/restrictTo");

const router = express.Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PNG, JPEG, and WEBP images are allowed"), false);
    }
  },
});

// All routes require authentication
router.use(protect);

// Current user signature routes
router.post(
  "/upload",
  upload.single("signature"),
  signatureController.uploadSignature
);
router.get("/me", signatureController.getMySignature);
router.delete("/me", signatureController.deleteMySignature);

// Apply signature to document
router.post("/apply-to-pdf", signatureController.applySignatureToDocument);

// Admin routes
router.get(
  "/user/:userId",
  restrictTo("SUPER-ADMIN", "ADMIN"),
  signatureController.getUserSignature
);

module.exports = router;
