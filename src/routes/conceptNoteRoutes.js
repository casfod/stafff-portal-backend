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

// Create a new conceptNote
conceptNoteRouter.post(
  "/",
  upload.array("files", 10),
  conceptNoteController.createConceptNote
);

// Save a new conceptNote
conceptNoteRouter.post("/save", conceptNoteController.saveConceptNote);

conceptNoteRouter.patch(
  "/update-status/:id",
  conceptNoteController.updateStatus
);

conceptNoteRouter.patch("/copy/:id", conceptNoteController.copyRequest);

// Update a conceptNote by ID
conceptNoteRouter.put(
  "/:id",
  upload.array("files", 10),
  conceptNoteController.updateConceptNote
);

// Delete a conceptNote by ID
conceptNoteRouter.delete("/:id", conceptNoteController.deleteConceptNote);

module.exports = conceptNoteRouter;
