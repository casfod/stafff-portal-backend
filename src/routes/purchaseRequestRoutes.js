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
} = require("../controllers/purchaseRequestController");
const express = require("express");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");

const purchaseRequestRouter = express.Router();

// Protect all routes after this middleware
purchaseRequestRouter.use(protect);

// // Create a new purchase request (supports both "save" and "save and send")
// purchaseRequestRouter.post("/", create);

// Save a purchase request (draft)
purchaseRequestRouter.post("/save", save);

// Save and send a purchase request (pending)
purchaseRequestRouter.post(
  "/save-and-send",
  upload.array("files", 10),
  saveAndSend
);

// Get all purchase requests stats
purchaseRequestRouter.get("/stats", getStats);
// Get all purchase requests
purchaseRequestRouter.get("/", getAll);

// Get a single purchase request by ID
purchaseRequestRouter.get("/:id", getById);

// Update a purchase request
purchaseRequestRouter.put("/:id", upload.array("files", 10), update);

// Update purchase request status
purchaseRequestRouter.patch("/update-status/:id", updateStatus);
purchaseRequestRouter.patch("/copy/:id", copyRequest);

// Comment routes
purchaseRequestRouter.post("/:id/comments", addCommentToRequest);
purchaseRequestRouter.put("/:id/comments/:commentId", updateCommentInRequest);
purchaseRequestRouter.delete(
  "/:id/comments/:commentId",
  deleteCommentFromRequest
);

// Delete a purchase request
purchaseRequestRouter.delete("/:id", remove);

module.exports = purchaseRequestRouter;
