const {
  save,
  saveAndSend,
  getAll,
  getById,
  update,
  remove,
  updateStatus,
  getStats,
} = require("../controllers/travelRequestController");
const express = require("express");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");

const travelRequestRouter = express.Router();

// Protect all routes after this middleware
travelRequestRouter.use(protect);

// // Create a new advance request (supports both "save" and "save and send")
// travelRequestRouter.post("/", create);

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
travelRequestRouter.put("/:id", update);

// Update advance request status
travelRequestRouter.patch("/update-status/:id", updateStatus);

// Delete a advance request
travelRequestRouter.delete("/:id", remove);

module.exports = travelRequestRouter;
