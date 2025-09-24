const express = require("express");
const {
  getAllVendors,
  getVendorById,
  getVendorByCode,
  createVendor,
  updateVendor,
  deleteVendor,
} = require("../controllers/vendorController");
const protect = require("../middleware/protect");

const vendorRouter = express.Router();

// Protect all routes after this middleware
vendorRouter.use(protect);

vendorRouter
  .route("/")
  .get(getAllVendors) // GET /api/vendors?search=term&sort=field&page=1&limit=10
  .post(createVendor); // POST /api/vendors

vendorRouter.route("/code/:vendorCode").get(getVendorByCode); // GET /api/vendors/code/TEC00001

vendorRouter
  .route("/:vendorId")
  .get(getVendorById) // GET /api/vendors/:vendorId
  .patch(updateVendor) // PATCH /api/vendors/:vendorId
  .delete(deleteVendor); // DELETE /api/vendors/:vendorId

module.exports = vendorRouter;
