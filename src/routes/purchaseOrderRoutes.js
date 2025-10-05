const express = require("express");
const {
  createFromRFQ,
  createIndependent,
  getAll,
  getById,
  update,
  updateStatus,
  remove,
} = require("../controllers/purchaseOrderController");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");
const {
  checkViewPermission,
  checkCreatePermission,
  checkUpdatePermission,
  checkDeletePermission,
} = require("../middleware/checkProcurementPermissions");

const purchaseOrderRouter = express.Router();

// Protect all routes
purchaseOrderRouter.use(protect);

// Apply procurement permissions to all routes
purchaseOrderRouter.post(
  "/create-from-rfq/:rfqId/:vendorId",
  upload.array("files", 10),
  checkCreatePermission,
  createFromRFQ
);

purchaseOrderRouter.post(
  "/create",
  upload.array("files", 10),
  checkCreatePermission,
  createIndependent
);

purchaseOrderRouter.get("/", checkViewPermission, getAll);
purchaseOrderRouter.get("/:id", checkViewPermission, getById);
purchaseOrderRouter.put(
  "/:id",
  upload.array("files", 10),
  checkUpdatePermission,
  update
);

// UPDATED: Allow file upload for status update (PDF sending)
purchaseOrderRouter.patch(
  "/update-status/:id",
  upload.single("pdfFile"), // NEW: Accept single PDF file
  checkUpdatePermission,
  updateStatus
);

purchaseOrderRouter.delete("/:id", checkDeletePermission, remove);

module.exports = purchaseOrderRouter;
