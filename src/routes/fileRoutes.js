// routes/fileRoutes.js
const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const fileService = require("../services/fileService");

// Create rate limit for file downloads
const downloadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 downloads per windowMs
  message: {
    error: "Too many download attempts, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  handler: (req, res) => {
    res.status(429).json({
      message: "Too many download attempts. Please try again in 15 minutes.",
    });
  },
});

// GET /api/files/:id/download
router.get("/:id/download", downloadLimiter, async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch file metadata from DB
    const file = await fileService.getFileById(id);
    if (!file) {
      return res.status(404).json({ message: "File not found" });
    }

    // Fetch the file from Cloudinary (or any storage)
    const response = await fetch(file.url);
    const buffer = await response.arrayBuffer();

    // Force download with proper filename
    res.setHeader("Content-Disposition", `attachment; filename="${file.name}"`);
    res.setHeader("Content-Type", file.mimeType);

    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("File download failed:", error);
    res.status(500).json({ message: "Error downloading file" });
  }
});

module.exports = router;
