const express = require("express");
const {
  create,
  getAll,
  getById,
  update,
  remove,
  getByPurchaseOrder,
  getSummary,
  checkGRNExists,
  addFiles,
} = require("../controllers/goodsReceivedController");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");
const {
  checkViewPermission,
  checkCreatePermission,
  checkUpdatePermission,
  checkDeletePermission,
} = require("../middleware/checkProcurementPermissions");

const goodsReceivedRouter = express.Router();

// Protect all routes
goodsReceivedRouter.use(protect);

// Apply procurement permissions to all routes
goodsReceivedRouter.post(
  "/",
  upload.array("files", 10),
  checkCreatePermission,
  create
);

goodsReceivedRouter.get("/", checkViewPermission, getAll);
goodsReceivedRouter.get("/summary", checkViewPermission, getSummary);
goodsReceivedRouter.get(
  "/purchase-order/:purchaseOrderId",
  checkViewPermission,
  getByPurchaseOrder
);
goodsReceivedRouter.get(
  "/check-exists/:purchaseOrderId",
  checkViewPermission,
  checkGRNExists
);
goodsReceivedRouter.get("/:id", checkViewPermission, getById);

goodsReceivedRouter.put(
  "/:id",
  upload.array("files", 10),
  checkUpdatePermission,
  update
);

// Dedicated endpoint for adding files to existing GRN
goodsReceivedRouter.post(
  "/:id/files",
  upload.array("files", 10),
  checkUpdatePermission,
  addFiles
);

goodsReceivedRouter.delete("/:id", checkDeletePermission, remove);

module.exports = goodsReceivedRouter;
