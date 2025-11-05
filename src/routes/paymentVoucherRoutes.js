// routes/paymentVoucherRoutes.js
const {
  save,
  saveAndSend,
  getAll,
  getById,
  update,
  remove,
  updateStatus,
  getStats,
  copyVoucher,
  addFiles,
} = require("../controllers/paymentVoucherController");
const express = require("express");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");
const {
  checkViewPermission,
  checkCreatePermission,
  checkUpdatePermission,
  checkDeletePermission,
} = require("../middleware/checkFinancePermissions");

const paymentVoucherRouter = express.Router();

paymentVoucherRouter.use(protect);

paymentVoucherRouter.post("/save", checkCreatePermission, save);
paymentVoucherRouter.post(
  "/save-and-send",
  checkCreatePermission,
  upload.array("files", 10),
  saveAndSend
);
paymentVoucherRouter.get("/stats", checkViewPermission, getStats);
paymentVoucherRouter.get("/", checkViewPermission, getAll);
paymentVoucherRouter.get("/:id", checkViewPermission, getById);
paymentVoucherRouter.put(
  "/:id",
  checkUpdatePermission,
  upload.array("files", 10),
  update
);
paymentVoucherRouter.patch(
  "/update-status/:id",
  checkUpdatePermission,
  updateStatus
);
paymentVoucherRouter.patch("/copy/:id", checkUpdatePermission, copyVoucher);
paymentVoucherRouter.delete("/:id", checkDeletePermission, remove);
paymentVoucherRouter.post(
  "/:id/files",
  checkCreatePermission,
  upload.array("files", 10),
  addFiles
);

module.exports = paymentVoucherRouter;
