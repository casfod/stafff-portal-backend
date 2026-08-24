import { Router } from 'express';
import multer from 'multer';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createStaffSchema,
  updateProfileSchema,
  updateEmploymentInfoSchema,
  changePasswordSchema,
  updateUserRoleSchema,
} from '../validators/user.validator';
import {
  getAllUsers, getUserById, getMe, updateMe, updateUser, createStaff,
  uploadAvatar, uploadUserAvatar, removeAvatar, changePassword,
  deactivateUser, activateUser, deleteUser, exportUsersExcel,
  uploadSignature,
  removeSignature,
} from '../controllers/user.controller';
import {
  getMyEmploymentInfo, updateMyEmploymentInfo,
} from '../controllers/employment-info.controller';
import { debugRequest } from '../middleware/debug.middleware';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

router.use(protect);

// ── Current user ──────────────────────────────────────────────────────────
router.get   ('/me',           getMe);
router.patch ('/me',           validate(updateProfileSchema), updateMe);
router.patch ('/me/password',  validate(changePasswordSchema), changePassword);
router.post  ('/me/avatar',    upload.single('avatar'), uploadAvatar);
router.post  ('/me/signature',    upload.single('avatar'), uploadSignature);
router.delete('/me/avatar',    removeAvatar);
router.delete('/me/signature',    removeSignature);

// ── Current user: employment info (fixed — was wrongly wired to getMe) ────
router.get(
  '/me/employment',
  restrictTo('STAFF', 'ADMIN', 'REVIEWER', 'SUPER-ADMIN'),
  getMyEmploymentInfo,
);
router.patch(
  '/me/employment',
  restrictTo('STAFF', 'ADMIN', 'REVIEWER', 'SUPER-ADMIN'),
  validate(updateEmploymentInfoSchema),
  updateMyEmploymentInfo,
);

// ── Admin & Super-admin: list users, export ───────────────────────────────
// router.get ('/',       restrictTo('ADMIN', 'SUPER-ADMIN'), getAllUsers);
router.get ('/',  getAllUsers);
router.get ('/export', restrictTo('SUPER-ADMIN'), exportUsersExcel);

router.post(
  '/staff',
  debugRequest('add staff'),
  restrictTo('SUPER-ADMIN'),
  validate(createStaffSchema),
  createStaff,
);

// ── Individual user management (role/profile — NOT employment info) ───────
router
  .route('/:id')
  // .get   (restrictTo('ADMIN', 'SUPER-ADMIN'), getUserById)
  .get   (getUserById)
  .patch (restrictTo('ADMIN', 'SUPER-ADMIN'), validate(updateUserRoleSchema), updateUser)
  .delete(restrictTo('SUPER-ADMIN'), deleteUser);

router.post(
  '/:id/avatar',
  restrictTo('ADMIN', 'SUPER-ADMIN'),
  upload.single('avatar'),
  uploadUserAvatar,
);

// Employment-info for a specific user now lives ONLY at /admin/employment-info/:id
// (removed the duplicate /:id/employment and /:id/employment/lock routes here)

router.patch('/:id/deactivate', restrictTo('ADMIN', 'SUPER-ADMIN'), deactivateUser);
router.patch('/:id/activate',   restrictTo('ADMIN', 'SUPER-ADMIN'), activateUser);

export default router;