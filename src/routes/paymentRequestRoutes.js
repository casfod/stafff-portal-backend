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
} = require("../controllers/paymentRequestController");
const express = require("express");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");

const paymentRequestRouter = express.Router();

// Protect all routes after this middleware
paymentRequestRouter.use(protect);

// // Create a new payment request (supports both "save" and "save and send")
// paymentRequestRouter.post("/", create);

// Save a payment request (draft)
paymentRequestRouter.post("/save", save);

// Save and send a payment request (pending)
paymentRequestRouter.post(
  "/save-and-send",
  upload.array("files", 10),
  saveAndSend
);

// Get all payment requests stats
paymentRequestRouter.get("/stats", getStats);
// Get all payment requests
paymentRequestRouter.get("/", getAll);

// Get a single payment request by ID
paymentRequestRouter.get("/:id", getById);

// Update a payment request
paymentRequestRouter.put("/:id", upload.array("files", 10), update);

// Update payment Request status
paymentRequestRouter.patch("/update-status/:id", updateStatus);
paymentRequestRouter.patch("/copy/:id", copyRequest);

// Delete a payment request
paymentRequestRouter.delete("/:id", remove);

module.exports = paymentRequestRouter;
