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

// Protect all routes after this middleware
router.use(protect);

router.post("/addUser", restrictTo("SUPER-ADMIN"), authController.addUser);
router.patch(
  "/deleteUser/:userID",
  restrictTo("SUPER-ADMIN"),
  userController.deleteUser
);
router.patch(
  "/updateUserRole/:userID",
  restrictTo("SUPER-ADMIN"),
  userController.updateRole
);
router.get("/", restrictTo("SUPER-ADMIN", "ADMIN"), userController.getAllUsers);

router.patch("/updatePassword", authController.updatePassword);
router.get("/me", userController.getUserByToken);
// router.patch(
//   "/updateMe",
//   userController.uploadUserPhoto,
//   userController.resizeUserPhoto,
//   userController.updateMe
// );
// router.delete("/deleteMe", userController.deleteMe);

// router.use(authController.restrictTo("admin"));

// router
//   .route("/")
//   .get(userController.getAllUsers)
//   .post(userController.createUser);

// router
//   .route("/:id")
//   .get(userController.getUser)
//   .patch(userController.updateUser)
//   .delete(userController.deleteUser);

module.exports = router;
