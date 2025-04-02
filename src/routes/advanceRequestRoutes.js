const {
  save,
  saveAndSend,
  getAll,
  getById,
  update,
  remove,
  updateStatus,
  getStats,
} = require("../controllers/advanceRequestController");
const express = require("express");
const protect = require("../middleware/protect");

const advanceRequestRouter = express.Router();

// Protect all routes after this middleware
advanceRequestRouter.use(protect);

// // Create a new advance request (supports both "save" and "save and send")
// advanceRequestRouter.post("/", create);

// Save a advance request (draft)
advanceRequestRouter.post("/save", save);

// Save and send a advance request (pending)
advanceRequestRouter.post("/save-and-send", saveAndSend);

// Get all advance requests stats
advanceRequestRouter.get("/stats", getStats);
// Get all advance requests
advanceRequestRouter.get("/", getAll);

// Get a single advance request by ID
advanceRequestRouter.get("/:id", getById);

// Update a advance request
advanceRequestRouter.put("/:id", update);

// Update advance request status
advanceRequestRouter.patch("/update-status/:id", updateStatus);

// Delete a advance request
advanceRequestRouter.delete("/:id", remove);

module.exports = advanceRequestRouter;
