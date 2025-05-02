// const { uploadFile, deleteFile } = require("../services/fileService.js");
const { uploadFile, deleteFile } = require("../services/fileServiceCLDR.js");
const File = require("../models/FileModel");

async function uploadFileHandler(req, res) {
  try {
    const { buffer, originalname, mimetype } = req.file;
    const file = await uploadFile(buffer, originalname, mimetype);

    res.status(201).json(file);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Upload failed" });
  }
}

async function getFiles(req, res) {
  const files = await File.find().sort({ createdAt: -1 });
  res.json(files);
}

async function deleteFileHandler(req, res) {
  try {
    await deleteFile(req.params.id);
    res.json({ message: "File deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Deletion failed" });
  }
}

module.exports = {
  uploadFileHandler,
  getFiles,
  deleteFileHandler,
};
