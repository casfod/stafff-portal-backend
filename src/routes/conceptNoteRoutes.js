// routes/projectRoutes.js
const express = require("express");
const conceptNoteController = require("../controllers/conceptNoteController.js");
const protect = require("../middleware/protect.js");

const conceptNoteRouter = express.Router();

conceptNoteRouter.use(protect);

// Get all conceptNotes stats
conceptNoteRouter.get("/stats", conceptNoteController.getStats);

// Get all conceptNotes
conceptNoteRouter.get("/", conceptNoteController.getAllConceptNotes);

// Get a conceptNote by ID
conceptNoteRouter.get("/:id", conceptNoteController.getConceptNoteById);

// Create a new conceptNote
conceptNoteRouter.post("/", conceptNoteController.createConceptNote);

// Save a new conceptNote
conceptNoteRouter.post("/save", conceptNoteController.saveConceptNote);
conceptNoteRouter.patch(
  "/update-status/:id",
  conceptNoteController.updateStatus
);

// Update a conceptNote by ID
conceptNoteRouter.put("/:id", conceptNoteController.updateConceptNote);

// Delete a conceptNote by ID
conceptNoteRouter.delete("/:id", conceptNoteController.deleteConceptNote);

module.exports = conceptNoteRouter;
