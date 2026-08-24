import { Router } from 'express';
import authRoutes        from './auth.routes';
import userRoutes        from './user.routes';
import financeRoutes     from './finance.routes';
import procurementRoutes from './procurement.routes';
import hrRoutes          from './hr.routes';
import adminRoutes       from './admin.routes';
import fileRoutes       from './file.routes';
import migrationsRoutes from './migrations.routes';

const router = Router();

// ─── Public + Auth ────────────────────────────────────────────────────────────
router.use('/auth',        authRoutes);

// ─── User management ──────────────────────────────────────────────────────────
router.use('/users',       userRoutes);

// ─── File management ──────────────────────────────────────────────────────────
router.use('/files',       fileRoutes);  // ✅ Add this

// ─── Finance module ───────────────────────────────────────────────────────────
// Concept notes, advance requests, expense claims, travel requests,
// payment requests, payment vouchers
router.use('/finance',     financeRoutes);

// ─── Procurement module ───────────────────────────────────────────────────────
// Purchase requests, RFQs, purchase orders, goods received
router.use('/procurement', procurementRoutes);

// ─── HR module ────────────────────────────────────────────────────────────────
// Leave, staff strategy, appraisals
router.use('/hr',          hrRoutes);

// ─── Admin module ─────────────────────────────────────────────────────────────
// Projects, vendors, system settings, employment info admin
router.use('/admin',       adminRoutes);

// ─── Database migrations (admin only) ───────────────────────────────────────
router.use('/migrations',  migrationsRoutes);

export default router;
