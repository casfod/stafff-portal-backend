const {
  save,
  saveAndSend,
  getAll,
  getById,
  update,
  remove,
  updateStatus,
} = require("../controllers/purchaseRequestController");
const express = require("express");
const protect = require("../middleware/protect");

const purchaseRequestRouter = express.Router();

// Protect all routes after this middleware
purchaseRequestRouter.use(protect);

// // Create a new purchase request (supports both "save" and "save and send")
// purchaseRequestRouter.post("/", create);

// Save a purchase request (draft)
purchaseRequestRouter.post("/save", save);

// Save and send a purchase request (pending)
purchaseRequestRouter.post("/save-and-send", saveAndSend);

// Get all purchase requests
purchaseRequestRouter.get("/", getAll);

// Get a single purchase request by ID
purchaseRequestRouter.get("/:id", getById);

// Update a purchase request
purchaseRequestRouter.put("/:id", update);

// Update purchase request status
purchaseRequestRouter.patch("/update-status/:id", updateStatus);

// Delete a purchase request
purchaseRequestRouter.delete("/:id", remove);

module.exports = purchaseRequestRouter;
