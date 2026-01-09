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
} = require("../controllers/travelRequestController");
const express = require("express");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");

const travelRequestRouter = express.Router();

// Protect all routes after this middleware
travelRequestRouter.use(protect);

// Save a advance request (draft)
travelRequestRouter.post("/save", save);

// Save and send a advance request (pending)
travelRequestRouter.post(
  "/save-and-send",
  upload.array("files", 10),
  saveAndSend
);

// Get all advance requests stats
travelRequestRouter.get("/stats", getStats);
// Get all advance requests
travelRequestRouter.get("/", getAll);

// Get a single advance request by ID
travelRequestRouter.get("/:id", getById);

// Update a advance request
travelRequestRouter.put("/:id", upload.array("files", 10), update);

// Update advance request status
travelRequestRouter.patch("/update-status/:id", updateStatus);

travelRequestRouter.patch("/copy/:id", copyRequest);

// Copy advance request
travelRequestRouter.patch("/copy/:id", copyRequest);

// Comment routes
travelRequestRouter.post("/:id/comments", addCommentToRequest);
travelRequestRouter.put("/:id/comments/:commentId", updateCommentInRequest);
travelRequestRouter.delete(
  "/:id/comments/:commentId",
  deleteCommentFromRequest
);

// Delete a advance request
travelRequestRouter.delete("/:id", remove);

module.exports = travelRequestRouter;
