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
const {
  checkViewPermission,
  checkCreatePermission,
  checkUpdatePermission,
  checkDeletePermission,
} = require("../middleware/checkProcurementPermissions");

const rfqRouter = express.Router();

// Protect all routes
rfqRouter.use(protect);

// Apply procurement permissions to all routes
rfqRouter.post("/save", checkCreatePermission, save);
rfqRouter.post(
  "/save-to-send",
  upload.array("files", 10),
  checkCreatePermission,
  savetoSend
);
rfqRouter.get("/", checkViewPermission, getAll);
rfqRouter.get("/:id", checkViewPermission, getById);
rfqRouter.put("/:id", upload.array("files", 10), checkUpdatePermission, update);
rfqRouter.patch("/update-status/:id", checkUpdatePermission, updateStatus);
rfqRouter.patch(
  "/copy/:id",
  upload.array("files", 1),
  checkUpdatePermission,
  copyRFQ
); // Limit to 1 PDF file
rfqRouter.delete("/:id", checkDeletePermission, remove);

module.exports = rfqRouter;
