const {
  save,
  saveAndSend,
  getAll,
  getById,
  update,
  remove,
  updateStatus,
  getStats,
  copyRequest,
  addCommentToRequest,
  updateCommentInRequest,
  deleteCommentFromRequest,
} = require("../controllers/advanceRequestController");
const express = require("express");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");

const advanceRequestRouter = express.Router();

// Protect all routes after this middleware
advanceRequestRouter.use(protect);

// Save a advance request (draft)
advanceRequestRouter.post("/save", save);

// Save and send a advance request (pending)
advanceRequestRouter.post(
  "/save-and-send",
  upload.array("files", 10),
  saveAndSend
);

// Get all advance requests stats
advanceRequestRouter.get("/stats", getStats);

// Get all advance requests
advanceRequestRouter.get("/", getAll);

// Get a single advance request by ID
advanceRequestRouter.get("/:id", getById);

// Update a advance request
advanceRequestRouter.put("/:id", upload.array("files", 10), update);

// Update advance request status
advanceRequestRouter.patch("/update-status/:id", updateStatus);

// Copy advance request
advanceRequestRouter.patch("/copy/:id", copyRequest);

// Comment routes
advanceRequestRouter.post("/:id/comments", addCommentToRequest);
advanceRequestRouter.put("/:id/comments/:commentId", updateCommentInRequest);
advanceRequestRouter.delete(
  "/:id/comments/:commentId",
  deleteCommentFromRequest
);

// Delete a advance request
advanceRequestRouter.delete("/:id", remove);

module.exports = advanceRequestRouter;
