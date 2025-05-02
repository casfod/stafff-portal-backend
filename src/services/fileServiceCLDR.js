const { Readable } = require("stream");
const cloudinary = require("../utils/cloudinary");
const File = require("../models/FileModel");

async function uploadFile(buffer, originalName, mimeType) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload(
      { resource_type: "auto", folder: "originalName" },
      async (error, result) => {
        if (error) return reject(error);

        // Save to MongoDB
        const file = await File.create({
          name: originalName,
          url: result.secure_url,
          driveId: result.public_id, // Important for deletion
        });

        resolve(file);
      }
    );

    // Create a Readable stream from buffer and pipe it to cloudinary
    Readable.from(buffer).pipe(uploadStream);
  });
}

async function deleteFile(fileId) {
  const file = await File.findById(fileId);
  if (!file) throw new Error("File not found");

  await cloudinary.uploader.destroy(file.driveId); // delete from cloudinary
  await file.deleteOne();
}

module.exports = {
  uploadFile,
  deleteFile,
};
