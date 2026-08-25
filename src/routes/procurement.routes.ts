import { Router } from 'express';
import multer from 'multer';
import { protect } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  copyDocumentSchema,
  addCommentSchema,
  updateCommentSchema,
  createPurchaseRequestSchema,
  savePurchaseRequestDraftSchema,
  purchaseRequestStatusSchema,
  createRFQSchema,
  sendRFQSchema,
  updateRFQStatusSchema,
  createPOFromRFQSchema,
  createIndependentPOSchema,
  updatePOStatusSchema,
  createGRNSchema,
  sendPOSchema,
} from '../validators/domain.validator';
import * as procurement from '../controllers/procurement.controller';

const router = Router();

// ── All routes require authentication ─────────────────────────────────────────
router.use(protect);

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE REQUEST  /procurement/purchase-requests
// ═══════════════════════════════════════════════════════════════════════════════
const pcrRouter = Router();

pcrRouter.get   ('/stats',                                             procurement.getPurchaseRequestStats);
pcrRouter.get   ('/',                                                  procurement.getAllPurchaseRequests);
pcrRouter.post  ('/draft', validate(savePurchaseRequestDraftSchema),   procurement.savePurchaseRequestDraft);
pcrRouter.post  ('/',      validate(createPurchaseRequestSchema),      procurement.createPurchaseRequest);
pcrRouter.get   ('/:id',                                               procurement.getPurchaseRequestById);
pcrRouter.patch ('/:id',                                               procurement.updatePurchaseRequest);
pcrRouter.patch ('/:id/status', validate(purchaseRequestStatusSchema), procurement.updatePurchaseRequestStatus);
pcrRouter.delete('/:id',                                               procurement.deletePurchaseRequest);
pcrRouter.post  ('/:id/copy',   validate(copyDocumentSchema),          procurement.copyPurchaseRequest);
pcrRouter.post  ('/:id/comments',       validate(addCommentSchema),    procurement.addPurchaseRequestComment);
pcrRouter.patch ('/:id/comments/:commentId', validate(updateCommentSchema), procurement.updatePurchaseRequestComment);
pcrRouter.delete('/:id/comments/:commentId', procurement.deletePurchaseRequestComment);

router.use('/purchase-requests', pcrRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// RFQ  /procurement/rfqs
// ═══════════════════════════════════════════════════════════════════════════════
const rfqRouter = Router();

rfqRouter.get   ('/',                                    procurement.getAllRFQs);
rfqRouter.post  ('/draft', validate(createRFQSchema),    procurement.saveRFQDraft);
rfqRouter.post  ('/', validate(createRFQSchema),         procurement.createRFQ);
rfqRouter.get   ('/:id',                                 procurement.getRFQById);
rfqRouter.patch ('/:id',                                 procurement.updateRFQ);
rfqRouter.patch ('/:id/status',  validate(updateRFQStatusSchema), procurement.updateRFQStatus);
// NOTE: no more multer here. The PDF is uploaded beforehand via
// POST /files/upload (associatedModel: 'RFQs', associatedId: rfq.id) —
// this route now takes a plain JSON body: { recipients: string[], fileIds?: string[] }.
// sendRFQSchema in domain.validator.ts needs updating to match (it likely
// still expects the old multipart/stringified-recipients shape).
rfqRouter.post(
  '/:id/send',
  validate(sendRFQSchema),
  procurement.sendRFQToVendors,
);

rfqRouter.delete('/:id',                         procurement.deleteRFQ);

router.use('/rfqs', rfqRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDER  /procurement/purchase-orders
// ═══════════════════════════════════════════════════════════════════════════════
const poRouter = Router();

poRouter.get ('/', procurement.getAllPurchaseOrders);
// Create from RFQ: POST /purchase-orders/rfq/:rfqId/vendor/:vendorId
poRouter.post(
  '/rfq/:rfqId/vendor/:vendorId',
  validate(createPOFromRFQSchema),
  procurement.createPurchaseOrderFromRFQ,
);
// Create independent PO
poRouter.post(
  '/',
  validate(createIndependentPOSchema),
  procurement.createIndependentPurchaseOrder,
);
poRouter.get   ('/:id',                           procurement.getPurchaseOrderById);
poRouter.patch ('/:id', procurement.updatePurchaseOrder);
poRouter.patch (
  '/:id/status',
  validate(updatePOStatusSchema),
  procurement.updatePurchaseOrderStatus,
);
// NEW: Send PO to vendor with file attachments
poRouter.post(
  '/:purchaseOrderId/send-to-vendor',
  validate(sendPOSchema),
  procurement.sendPurchaseOrderToVendor,
);
poRouter.post  ('/:id/comments', validate(addCommentSchema), procurement.addPurchaseOrderComment);
poRouter.patch ('/:id/comments/:commentId', validate(updateCommentSchema), procurement.updatePurchaseOrderComment);
poRouter.delete('/:id/comments/:commentId', procurement.deletePurchaseOrderComment);
poRouter.delete('/:id',          procurement.deletePurchaseOrder);

router.use('/purchase-orders', poRouter);
// ═══════════════════════════════════════════════════════════════════════════════
// GOODS RECEIVED  /procurement/goods-received
// ═══════════════════════════════════════════════════════════════════════════════
const grnRouter = Router();

grnRouter.get ('/summary',          procurement.getGRNSummary);
grnRouter.get ('/by-po/:poId',      procurement.getGoodsReceivedByPO);
grnRouter.get ('/check/:poId',      procurement.checkGRNExists);
grnRouter.get ('/',                 procurement.getAllGoodsReceived);
grnRouter.post('/', validate(createGRNSchema), procurement.createGoodsReceived);
grnRouter.get ('/:id',              procurement.getGoodsReceivedById);
grnRouter.patch('/:id',             procurement.updateGoodsReceived);
grnRouter.delete('/:id',            procurement.deleteGoodsReceived);

router.use('/goods-received', grnRouter);

export default router;