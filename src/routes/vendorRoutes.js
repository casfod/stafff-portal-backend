const express = require("express");
const {
  getAllVendors,
  getAllApprovedVendors,
  getVendorById,
  getVendorByCode,
  createVendor,
  createVendorDraft,
  updateVendor,
  updateVendorStatus,
  deleteVendor,
  exportVendorsToExcel,
  getVendorsByStatus,
  getVendorApprovalSummary,
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

vendorRouter.use(protect);

// Approval workflow routes
vendorRouter.get(
  "/approval/summary",
  checkViewPermission,
  getVendorApprovalSummary
);
vendorRouter.get("/status/:status", checkViewPermission, getVendorsByStatus);
vendorRouter.patch(
  "/:vendorId/status",
  checkUpdatePermission,
  updateVendorStatus
);

// Approved vendors only — use this everywhere vendors are selected outside of vendor management
// (e.g. purchase orders, contracts, finance) so draft/pending/rejected are never exposed
vendorRouter.get("/approved", checkViewPermission, getAllApprovedVendors);

// Vendor management routes
vendorRouter.get("/", checkViewPermission, getAllVendors);
vendorRouter.get("/export/excel", checkViewPermission, exportVendorsToExcel);
vendorRouter.get("/code/:vendorCode", checkViewPermission, getVendorByCode);
vendorRouter.get("/:vendorId", checkViewPermission, getVendorById);

// CRUD operations
vendorRouter.post(
  "/",
  upload.array("files", 10),
  checkCreatePermission,
  createVendor
);
vendorRouter.post(
  "/draft",
  upload.array("files", 10),
  checkCreatePermission,
  createVendorDraft
);
vendorRouter.patch(
  "/:vendorId",
  upload.array("files", 10),
  checkUpdatePermission,
  updateVendor
);
vendorRouter.delete("/:vendorId", checkDeletePermission, deleteVendor);

module.exports = vendorRouter;
