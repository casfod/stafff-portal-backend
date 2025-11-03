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

const paymentVoucherRouter = express.Router();

paymentVoucherRouter.use(protect);

paymentVoucherRouter.post("/save", save);
paymentVoucherRouter.post(
  "/save-and-send",
  upload.array("files", 10),
  saveAndSend
);
paymentVoucherRouter.get("/stats", getStats);
paymentVoucherRouter.get("/", getAll);
paymentVoucherRouter.get("/:id", getById);
paymentVoucherRouter.put("/:id", upload.array("files", 10), update);
paymentVoucherRouter.patch("/update-status/:id", updateStatus);
paymentVoucherRouter.patch("/copy/:id", copyVoucher);
paymentVoucherRouter.delete("/:id", remove);
paymentVoucherRouter.post("/:id/files", upload.array("files", 10), addFiles);

module.exports = paymentVoucherRouter;
