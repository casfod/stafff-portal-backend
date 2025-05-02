const mongoose = require("mongoose");

const fileSchema = new mongoose.Schema({
  name: String,
  url: String,
  driveId: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("File", fileSchema);
