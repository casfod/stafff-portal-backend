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

router.post("/addUser", restrictTo("SUPER-ADMIN"), authController.addUser);
router.delete(
  "/deleteUser/:userID",
  restrictTo("SUPER-ADMIN"),
  userController.deleteUser
);
router.patch(
  "/updateUserRole/:userID",
  restrictTo("SUPER-ADMIN"),
  userController.updateRole
);

router.get("/admins", userController.getAllAdmins);
router.get("/reviewers", userController.getAllReviewers);
router.get("/", restrictTo("SUPER-ADMIN", "ADMIN"), userController.getAllUsers);

router.patch("/updatePassword", authController.updatePassword);
router.get("/me", userController.getUserByToken);

module.exports = router;
