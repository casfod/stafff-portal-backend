// routes/fileRoutes.js
const express = require("express");
const router = express.Router();
const fileService = require("../services/fileService"); // adjust path

// GET /api/files/:id/download
router.get("/:id/download", async (req, res) => {
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
