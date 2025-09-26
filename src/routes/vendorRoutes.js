const express = require("express");
const {
  getAllVendors,
  getVendorById,
  getVendorByCode,
  createVendor,
  updateVendor,
  deleteVendor,
  exportVendorsToExcel,
} = require("../controllers/vendorController");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");
const {
  checkViewPermission,
  checkCreatePermission,
  checkUpdatePermission,
  checkDeletePermission,
} = require("../middleware/checkProcurementPermissions");

const vendorRouter = express.Router();

// Protect all routes after this middleware - THIS MUST COME FIRST
vendorRouter.use(protect);

// Apply procurement permissions to all routes (SUPER-ADMIN is handled within the permission functions)
vendorRouter.get("/", checkViewPermission, getAllVendors);
vendorRouter.get("/code/:vendorCode", checkViewPermission, getVendorByCode);
vendorRouter.get("/:vendorId", checkViewPermission, getVendorById);
vendorRouter.get("/export/excel", checkViewPermission, exportVendorsToExcel);
vendorRouter.post(
  "/",
  upload.array("files", 10),
  checkCreatePermission,
  createVendor
);
vendorRouter.patch(
  "/:vendorId",
  upload.array("files", 10),
  checkUpdatePermission,
  updateVendor
);
vendorRouter.delete("/:vendorId", checkDeletePermission, deleteVendor);

module.exports = vendorRouter;
