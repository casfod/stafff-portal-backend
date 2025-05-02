const multer = require("multer");
const fileService = require("../services/fileService");

// Configure multer for memory storage (files stored in memory, not on disk)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB file size limit
  },
});

/**
 * File Controller - Handles HTTP requests related to files
 */
class FileController {
  /**
   * Upload a file
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async uploadFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
      }

      const file = await fileService.uploadFile({
        buffer: req.file.buffer,
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
      });

      // Associate file with model if provided in request
      if (req.body.modelName && req.body.documentId) {
        await fileService.associateFile(
          file.id,
          req.body.modelName,
          req.body.documentId,
          req.body.fieldName || null
        );
      }

      res.status(201).json(file);
    } catch (error) {
      console.error("File upload error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Upload multiple files
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async uploadMultipleFiles(req, res) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No files provided" });
      }

      const uploadPromises = req.files.map((file) =>
        fileService.uploadFile({
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        })
      );

      const uploadedFiles = await Promise.all(uploadPromises);

      // Associate files with model if provided
      if (req.body.modelName && req.body.documentId) {
        const associationPromises = uploadedFiles.map((file) =>
          fileService.associateFile(
            file.id,
            req.body.modelName,
            req.body.documentId,
            req.body.fieldName || null
          )
        );

        await Promise.all(associationPromises);
      }

      res.status(201).json(uploadedFiles);
    } catch (error) {
      console.error("Multiple file upload error:", error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get a file by ID
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getFile(req, res) {
    try {
      const file = await fileService.getFileById(req.params.id);
      res.json(file);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }

  /**
   * Get all files associated with a document
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async getFilesByDocument(req, res) {
    try {
      const { modelName, documentId, fieldName } = req.query;

      if (!modelName || !documentId) {
        return res
          .status(400)
          .json({ error: "Model name and document ID are required" });
      }

      const files = await fileService.getFilesByDocument(
        modelName,
        documentId,
        fieldName || null
      );

      res.json(files);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Update file metadata
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async updateFile(req, res) {
    try {
      const updatedFile = await fileService.updateFile(req.params.id, req.body);
      res.json(updatedFile);
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }

  /**
   * Delete a file
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async deleteFile(req, res) {
    try {
      await fileService.deleteFile(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(404).json({ error: error.message });
    }
  }

  /**
   * Delete all files associated with a document
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   */
  async deleteFilesByDocument(req, res) {
    try {
      const { modelName, documentId } = req.query;

      if (!modelName || !documentId) {
        return res
          .status(400)
          .json({ error: "Model name and document ID are required" });
      }

      const count = await fileService.deleteFilesByDocument(
        modelName,
        documentId
      );
      res.json({ message: `${count} files deleted successfully` });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  }
}

// Export controller and multer middleware
module.exports = {
  fileController: new FileController(),
  upload,
};
