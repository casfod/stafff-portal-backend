const express = require("express");
const {
  save,
  savetoSend,
  getAll,
  getById,
  update,
  updateStatus,
  remove,
  copyRFQ,
} = require("../controllers/rfqController");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");

const rfqRouter = express.Router();

// Protect all routes
rfqRouter.use(protect);

// Save RFQ (draft)
rfqRouter.post("/save", save);

// Save and send RFQ to vendors
rfqRouter.post("/save-to-send", upload.array("files", 10), savetoSend);

// Get all RFQs
rfqRouter.get("/", getAll);

// Get RFQ by ID
rfqRouter.get("/:id", getById);

// Update RFQ
rfqRouter.put("/:id", upload.array("files", 10), update);

// Update RFQ status
rfqRouter.patch("/update-status/:id", updateStatus);

// Copy RFQ to vendors
rfqRouter.patch("/copy/:id", copyRFQ);

// Delete RFQ
rfqRouter.delete("/:id", remove);

module.exports = rfqRouter;
