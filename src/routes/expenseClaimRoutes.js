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
} = require("../controllers/expenseClaimsController");
const express = require("express");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");

const expenseClaimRouter = express.Router();

// Protect all routes after this middleware
expenseClaimRouter.use(protect);

// // Create a new advance request (supports both "save" and "save and send")
// expenseClaimRouter.post("/", create);

expenseClaimRouter.post("/save", save);
// Save and send a advance request (pending)
expenseClaimRouter.post(
  "/save-and-send",
  upload.array("files", 10),
  saveAndSend
);

// Get all advance requests stats
expenseClaimRouter.get("/stats", getStats);
// Get all advance requests
expenseClaimRouter.get("/", getAll);

// Get a single advance request by ID
expenseClaimRouter.get("/:id", getById);

// Update a advance request
expenseClaimRouter.put("/:id", upload.array("files", 10), update);

// Update advance request status
expenseClaimRouter.patch("/update-status/:id", updateStatus);
expenseClaimRouter.patch("/copy/:id", copyRequest);

// Comment routes
expenseClaimRouter.post("/:id/comments", addCommentToRequest);
expenseClaimRouter.put("/:id/comments/:commentId", updateCommentInRequest);
expenseClaimRouter.delete("/:id/comments/:commentId", deleteCommentFromRequest);

// Delete a advance request
expenseClaimRouter.delete("/:id", remove);

module.exports = expenseClaimRouter;
