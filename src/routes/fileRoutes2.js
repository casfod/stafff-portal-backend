const express = require("express");
const multer = require("multer");
const {
  uploadFileHandler,
  getFiles,
  deleteFileHandler,
} = require("../controllers/fileController");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.post("/upload", upload.single("file"), uploadFileHandler);
router.get("/files", getFiles);
router.delete("/files/:id", deleteFileHandler);

module.exports = router;
