// routes/leaveRoutes.js
const express = require("express");
const leaveController = require("../controllers/leaveController");
const protect = require("../middleware/protect");
const restrictTo = require("../middleware/restrictTo");
const { upload } = require("../controllers/fileController");

const leaveRouter = express.Router();

leaveRouter.use(protect);

// Statistics
leaveRouter.get("/stats", leaveController.getStats);

// User's own leave balance
leaveRouter.get("/my-balance", leaveController.getMyLeaveBalance);

// Get all leave applications
leaveRouter.get("/", leaveController.getAllLeaves);

// Get leave by ID
leaveRouter.get("/:id", leaveController.getLeaveById);

// Create new leave application
leaveRouter.post(
  "/",
  upload.array("files", 10),
  leaveController.createLeaveApplication
);

// Save leave as draft
leaveRouter.post("/save", leaveController.saveLeaveDraft);

// Update leave status
leaveRouter.patch("/update-status/:id", leaveController.updateLeaveStatus);

// Copy leave to other users
leaveRouter.patch("/copy/:id", leaveController.copyLeave);

// Update leave application
leaveRouter.put(
  "/:id",
  upload.array("files", 10),
  leaveController.updateLeaveApplication
);

// Delete leave application
leaveRouter.delete("/:id", leaveController.deleteLeaveApplication);

// Comment routes
leaveRouter.post("/:id/comments", leaveController.addComment);
leaveRouter.put("/:id/comments/:commentId", leaveController.updateComment);
leaveRouter.delete("/:id/comments/:commentId", leaveController.deleteComment);

// Admin routes
leaveRouter.get(
  "/admin/user-balance/:userId",
  restrictTo("SUPER-ADMIN", "ADMIN"),
  leaveController.getUserLeaveBalance
);

module.exports = leaveRouter;
