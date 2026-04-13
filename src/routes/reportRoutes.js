const {
  save,
  saveAndSend,
  getAll,
  getById,
  update,
  remove,
  updateStatus,
  getStats,
  copyReport,
  addCommentToReport,
  updateCommentInReport,
  deleteCommentFromReport,
} = require("../controllers/reportController");
const express = require("express");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");

const reportRouter = express.Router();

// Protect all routes after this middleware
reportRouter.use(protect);

// Save a report (draft)
reportRouter.post("/save", save);

// Save and send a report (pending)
reportRouter.post("/save-and-send", upload.array("files", 10), saveAndSend);

// Get all report stats
reportRouter.get("/stats", getStats);

// Get all reports
reportRouter.get("/", getAll);

// Get a single report by ID
reportRouter.get("/:id", getById);

// Update a report
reportRouter.put("/:id", upload.array("files", 10), update);

// Update report status
reportRouter.patch("/update-status/:id", updateStatus);

// Copy report
reportRouter.patch("/copy/:id", copyReport);

// Comment routes
reportRouter.post("/:id/comments", addCommentToReport);
reportRouter.put("/:id/comments/:commentId", updateCommentInReport);
reportRouter.delete("/:id/comments/:commentId", deleteCommentFromReport);

// Delete a report
reportRouter.delete("/:id", remove);

module.exports = reportRouter;
