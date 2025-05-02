const { google } = require("googleapis");
const File = require("../models/FileModel");

const auth = new google.auth.GoogleAuth({
  keyFile: "credentials.json",
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });

async function uploadFile(buffer, originalName, mimeType) {
  const response = await drive.files.create({
    requestBody: {
      name: originalName,
      parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
    },
    media: {
      mimeType: mimeType,
      body: Buffer.from(buffer),
    },
  });

  // Make file public
  await drive.permissions.create({
    fileId: response.data.id,
    requestBody: { role: "reader", type: "anyone" },
  });

  const url = `https://drive.google.com/uc?id=${response.data.id}`;

  // Save file details to DB
  const file = await File.create({
    name: originalName,
    url,
    driveId: response.data.id,
  });

  return file;
}

async function deleteFile(fileId) {
  const file = await File.findById(fileId);
  if (!file) throw new Error("File not found");

  await drive.files.delete({ fileId: file.driveId });
  await file.deleteOne();
}

module.exports = {
  uploadFile,
  deleteFile,
};
