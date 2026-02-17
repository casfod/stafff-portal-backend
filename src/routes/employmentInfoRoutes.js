const express = require("express");
const employmentInfoController = require("../controllers/employmentInfoController");
const protect = require("../middleware/protect");
const restrictTo = require("../middleware/restrictTo");

const router = express.Router();

router.use(protect);

// Staff routes
router.get("/me", employmentInfoController.getEmploymentInfo);
router.patch("/me", employmentInfoController.updateEmploymentInfo);
router.get(
  "/admin/status",
  employmentInfoController.getAllEmploymentInfoStatus
);
router.get("/admin/settings", employmentInfoController.getGlobalSettings);

// SUPER-ADMIN routes for managing any user's employment info
router.use(restrictTo("SUPER-ADMIN"));

router.get(
  "/super-admin/user/:userId",
  employmentInfoController.superAdminGetEmploymentInfo
);
router.patch(
  "/super-admin/user/:userId",
  employmentInfoController.superAdminUpdateEmploymentInfo
);

// Admin routes (accessible by SUPER-ADMIN and ADMIN)
router.use(restrictTo("SUPER-ADMIN", "ADMIN"));

router.get(
  "/admin/status",
  employmentInfoController.getAllEmploymentInfoStatus
);
router.get("/admin/settings", employmentInfoController.getGlobalSettings);

// SUPER-ADMIN only routes for toggling locks
router.patch(
  "/admin/toggle-global",
  restrictTo("SUPER-ADMIN"),
  employmentInfoController.toggleGlobalEmploymentInfoLock
);

router.patch(
  "/admin/toggle-user/:userId",
  restrictTo("SUPER-ADMIN", "ADMIN"),
  employmentInfoController.toggleUserEmploymentInfoLock
);

module.exports = router;
