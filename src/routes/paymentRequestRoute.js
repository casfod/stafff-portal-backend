const express = require("express");
const { auth, restrictTo } = require("../middlewares/auth");
const {
  getAll,
  save,
  saveAndSend,
  review,
  approve,
  reject,
} = require("../controllers/paymentRequest.controller");

const paymentRequestRouter = express.Router();

// Staff routes
paymentRequestRouter.post("/", auth, restrictTo("STAFF", "ADMIN"), save);
paymentRequestRouter.post(
  "/submit",
  auth,
  restrictTo("STAFF", "ADMIN"),
  saveAndSend
);

// Reviewer routes
paymentRequestRouter.patch(
  "/:id/review",
  auth,
  restrictTo("REVIEWER", "ADMIN"),
  review
);

// Admin routes
paymentRequestRouter.patch(
  "/:id/approve",
  auth,
  restrictTo("ADMIN", "SUPER-ADMIN"),
  approve
);
paymentRequestRouter.patch(
  "/:id/reject",
  auth,
  restrictTo("ADMIN", "SUPER-ADMIN"),
  reject
);

// Get all (role-based filtering)
paymentRequestRouter.get("/", auth, getAll);

module.exports = paymentRequestRouter;
