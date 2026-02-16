const express = require("express");
const userController = require("./../controllers/userController");
const authController = require("./../controllers/authController");
const protect = require("../middleware/protect");
const restrictTo = require("../middleware/restrictTo");

const router = express.Router();

router.post("/login", authController.login);
router.get("/logout", authController.logout);

router.post("/forgotPassword", authController.forgotPassword);
router.patch("/resetPassword/:token", authController.resetPassword);

router.use(protect);
// Protect all routes after this middleware

// Specific routes first
router.post("/addUser", restrictTo("SUPER-ADMIN"), authController.addUser);
router.patch("/updatePassword", authController.updatePassword);
router.get("/me", userController.getUserByToken);
router.get("/:id", userController.getUserById);

// Collection routes before parameterized routes
router.get("/admins", userController.getAllAdmins);
router.get("/reviewers", userController.getAllReviewers);
router.get("/", userController.getAllUsers);

// Parameterized routes LAST
router.delete("/:userID", restrictTo("SUPER-ADMIN"), userController.deleteUser);
router.patch(
  "/updateUserAdmin/:userID",
  restrictTo("SUPER-ADMIN"),
  userController.updateUserAdmin
);

module.exports = router;
