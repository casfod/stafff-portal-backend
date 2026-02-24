// routes/staffStrategyRoutes.js
const express = require("express");
const {
  create,
  saveDraft,
  submitDraft,
  getAll,
  getById,
  update,
  updateStatus,
  addCommentToRequest,
  updateCommentInRequest,
  deleteCommentFromRequest,
  remove,
  // getStats, // You'll need to add this to controller
} = require("../controllers/staffStrategyController");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");

const staffStrategyRouter = express.Router();

// Protect all routes
staffStrategyRouter.use(protect);

// ========== STATS ==========
// Get stats (similar to conceptNote)
// staffStrategyRouter.get("/stats", getStats);

// ========== CREATE / SAVE ==========
// Create and submit directly (with approver)
staffStrategyRouter.post("/", upload.array("files", 10), create);

// Save as draft (no approver needed)
staffStrategyRouter.post("/save", saveDraft);

// Submit draft for approval (with files)
staffStrategyRouter.post("/:id/submit", upload.array("files", 10), submitDraft);

// ========== READ ==========
// Get all with filters
staffStrategyRouter.get("/", getAll);

// Get single by ID
staffStrategyRouter.get("/:id", getById);

// ========== UPDATE ==========
// Update strategy (draft/pending only)
staffStrategyRouter.put("/:id", upload.array("files", 10), update);

// Update status (approve/reject) - exactly like PO
staffStrategyRouter.patch(
  "/update-status/:id",
  upload.single("pdfFile"), // Single file for approval/rejection document
  updateStatus
);

// ========== COMMENTS ==========
// Add comment
staffStrategyRouter.post("/:id/comments", addCommentToRequest);

// Update comment
staffStrategyRouter.put("/:id/comments/:commentId", updateCommentInRequest);

// Delete comment
staffStrategyRouter.delete(
  "/:id/comments/:commentId",
  deleteCommentFromRequest
);

// ========== DELETE ==========
// Delete strategy (draft only)
staffStrategyRouter.delete("/:id", remove);

module.exports = staffStrategyRouter;
