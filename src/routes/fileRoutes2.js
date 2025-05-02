const express = require("express");
const { fileController, upload } = require("../controllers/fileController");

const router = express.Router();

/**
 * @route POST /api/files
 * @desc Upload a single file
 * @access Public
 */
router.post("/", upload.single("file"), fileController.uploadFile);

/**
 * @route POST /api/files/multiple
 * @desc Upload multiple files
 * @access Public
 */
router.post(
  "/multiple",
  upload.array("files", 10),
  fileController.uploadMultipleFiles
);

/**
 * @route GET /api/files/:id
 * @desc Get a file by ID
 * @access Public
 */
router.get("/:id", fileController.getFile);

/**
 * @route GET /api/files
 * @desc Get files by document
 * @access Public
 */
router.get("/", fileController.getFilesByDocument);

/**
 * @route PATCH /api/files/:id
 * @desc Update file metadata
 * @access Public
 */
router.patch("/:id", fileController.updateFile);

/**
 * @route DELETE /api/files/:id
 * @desc Delete a file
 * @access Public
 */
router.delete("/:id", fileController.deleteFile);

/**
 * @route DELETE /api/files
 * @desc Delete files by document
 * @access Public
 */
router.delete("/", fileController.deleteFilesByDocument);

module.exports = router;
