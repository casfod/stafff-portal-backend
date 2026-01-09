// routes/projectRoutes.js
const express = require("express");
const conceptNoteController = require("../controllers/conceptNoteController.js");
const protect = require("../middleware/protect.js");
const { upload } = require("../controllers/fileController.js");

const conceptNoteRouter = express.Router();

conceptNoteRouter.use(protect);

// Get all conceptNotes stats
conceptNoteRouter.get("/stats", conceptNoteController.getStats);

// Get all conceptNotes
conceptNoteRouter.get("/", conceptNoteController.getAllConceptNotes);

// Get a conceptNote by ID
conceptNoteRouter.get("/:id", conceptNoteController.getConceptNoteById);

// Create a new conceptNote (with review step)
conceptNoteRouter.post(
  "/",
  upload.array("files", 10),
  conceptNoteController.createConceptNote
);

// Save a conceptNote as draft (without review step)
conceptNoteRouter.post("/save", conceptNoteController.saveConceptNote);

// Update conceptNote status (for review/approval workflow)
conceptNoteRouter.patch(
  "/update-status/:id",
  conceptNoteController.updateStatus
);

// Copy conceptNote to other users
conceptNoteRouter.patch("/copy/:id", conceptNoteController.copyRequest);

// Update a conceptNote by ID
conceptNoteRouter.put(
  "/:id",
  upload.array("files", 10),
  conceptNoteController.updateConceptNote
);

// Comment routes
conceptNoteRouter.post(
  "/:id/comments",
  conceptNoteController.addCommentToRequest
);
conceptNoteRouter.put(
  "/:id/comments/:commentId",
  conceptNoteController.updateCommentInRequest
);
conceptNoteRouter.delete(
  "/:id/comments/:commentId",
  conceptNoteController.deleteCommentFromRequest
);

// Delete a conceptNote by ID
conceptNoteRouter.delete("/:id", conceptNoteController.deleteConceptNote);

module.exports = conceptNoteRouter;
