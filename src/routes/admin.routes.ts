import { Router } from 'express';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  createProjectSchema,
  createVendorSchema,
  updateSystemSettingsSchema,
} from '../validators/domain.validator';
import * as admin from '../controllers/admin.controller';
import * as employmentInfo from '../controllers/employment-info.controller';
import { parseJsonFields } from '../middleware/multipart.middleware';
import { debugRequest } from '../middleware/debug.middleware';

// All JSON fields for project
const PROJECT_JSON_FIELDS = [
  'projectPartners',
  'implementationPeriod', 
  'accountCodes',
  'sectors',
  'milestones',
  'projectLocations',
  'targetBeneficiaries'
];


const router = Router();

// ── All routes require authentication + at minimum REVIEWER ──────────────────
router.use(protect);

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT  /admin/projects
// ═══════════════════════════════════════════════════════════════════════════════
const projectRouter = Router();

// Stats and list are accessible to all authenticated users (needed by forms)
projectRouter.get('/stats',                         admin.getProjectStats);
projectRouter.get('/',                              admin.getAllProjects);
projectRouter.get('/:id',                           admin.getProjectById);
// admin.routes.ts


// POST route
projectRouter.post(
  '/',
  restrictTo('ADMIN', 'SUPER-ADMIN'),
 
  parseJsonFields(PROJECT_JSON_FIELDS), // 👈 Just add this line
  validate(createProjectSchema),
  admin.createProject,
);

// PATCH route - same thing
projectRouter.patch(
  '/:id',
  restrictTo('ADMIN', 'SUPER-ADMIN'),
  parseJsonFields(PROJECT_JSON_FIELDS), // 👈 Same line
  admin.updateProject,
);
projectRouter.delete(
  '/:id',
  restrictTo('SUPER-ADMIN'),
  admin.deleteProject,
);

router.use('/projects', projectRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// VENDOR  /admin/vendors
// ═══════════════════════════════════════════════════════════════════════════════
const vendorRouter = Router();

// Vendor list visible to all authenticated users (needed for PO/RFQ forms)
vendorRouter.get('/export', restrictTo('SUPER-ADMIN'), admin.exportVendorsToExcel); // ← moved here, and BEFORE '/:id'
vendorRouter.get('/',       admin.getAllVendors);
vendorRouter.get('/:id',    admin.getVendorById);

// Write operations: ADMIN+
vendorRouter.post(
  '/draft',
  restrictTo('ADMIN', 'SUPER-ADMIN'),
  admin.saveVendorDraft,
);
vendorRouter.post(
  '/',
  restrictTo('ADMIN', 'SUPER-ADMIN'),
  debugRequest("createVendor"),
  validate(createVendorSchema),
  admin.createVendor,
);
vendorRouter.patch(
  '/:id',
  restrictTo('ADMIN', 'SUPER-ADMIN'),
  admin.updateVendor,
);
vendorRouter.patch(
  '/:id/status',
  restrictTo('ADMIN', 'SUPER-ADMIN'),
  admin.updateVendorStatus,
);
vendorRouter.delete(
  '/:id',
  restrictTo('SUPER-ADMIN'), admin.deleteVendor,
);

router.use('/vendors', vendorRouter);


// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS  /admin/settings
// ═══════════════════════════════════════════════════════════════════════════════
const settingsRouter = Router();

settingsRouter.use(restrictTo('ADMIN', 'SUPER-ADMIN'));

settingsRouter.get ('/',                 admin.getSystemSettings);
settingsRouter.patch('/',                validate(updateSystemSettingsSchema), admin.updateSystemSettings);
settingsRouter.get ('/global',           admin.getGlobalSettings);
// Employment lock: SUPER-ADMIN only
settingsRouter.patch(
  '/global-lock',
  restrictTo('SUPER-ADMIN'),
  debugRequest("toggleGlobalLock"),
  admin.toggleGlobalLock,
);
// Migration utilities: SUPER-ADMIN only
settingsRouter.get  ('/migration',       restrictTo('SUPER-ADMIN'), admin.getMigrationStatus);
settingsRouter.post ('/migration/run',   restrictTo('SUPER-ADMIN'), admin.runMigration);

router.use('/settings', settingsRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYMENT INFO (admin view)  /admin/employment-info
// ═══════════════════════════════════════════════════════════════════════════════
const eiRouter = Router();
eiRouter.use(restrictTo('ADMIN', 'SUPER-ADMIN'));

eiRouter.get   ('/',           employmentInfo.getAllEmploymentInfoStatus);
eiRouter.get   ('/:id',        employmentInfo.getUserEmploymentInfo);
eiRouter.patch ('/:id',        employmentInfo.superAdminUpdateEmploymentInfo);
eiRouter.patch ('/:id/lock',   employmentInfo.toggleUserLock);

router.use('/employment-info', eiRouter);

export default router;