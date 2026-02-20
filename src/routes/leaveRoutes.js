// routes/leaveRoutes.js
const express = require("express");
const leaveController = require("../controllers/leaveController");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");
const restrictTo = require("../middleware/restrictTo");

const leaveRouter = express.Router();

// All routes require authentication
leaveRouter.use(protect);

// Statistics - accessible to all authenticated users
leaveRouter.get("/stats", leaveController.getStats);

// User's own leave balance
leaveRouter.get("/my-balance", leaveController.getMyLeaveBalance);

// Get all leave applications (with role-based filtering)
leaveRouter.get("/", leaveController.getAllLeaves);

// Get leave by ID
leaveRouter.get("/:id", leaveController.getLeaveById);

// Create new leave application (with file uploads)
leaveRouter.post(
  "/",
  upload.array("files", 10),
  leaveController.createLeaveApplication
);

// Save leave as draft (no file uploads needed for draft)
leaveRouter.post("/save", leaveController.saveLeaveDraft);

// Update leave status (review/approve/reject)
leaveRouter.patch("/update-status/:id", leaveController.updateLeaveStatus);

// Copy leave to other users
leaveRouter.patch("/copy/:id", leaveController.copyLeave);

// Update leave application (with file uploads) - ORDER MATCHES CONCEPTNOTE
leaveRouter.put(
  "/:id",
  upload.array("files", 10),
  leaveController.updateLeaveApplication
);

// Delete leave application
leaveRouter.delete("/:id", leaveController.deleteLeaveApplication);

// Comment routes - ORDER MATCHES CONCEPTNOTE
leaveRouter.post("/:id/comments", leaveController.addComment);
leaveRouter.put("/:id/comments/:commentId", leaveController.updateComment);
leaveRouter.delete("/:id/comments/:commentId", leaveController.deleteComment);

// Admin routes - restricted to SUPER-ADMIN and ADMIN only
leaveRouter.get(
  "/admin/user-balance/:userId",
  restrictTo("SUPER-ADMIN", "ADMIN"),
  leaveController.getUserLeaveBalance
);

module.exports = leaveRouter;
