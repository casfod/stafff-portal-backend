import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { sendSuccess, sendCreated, sendNoContent } from '../utils/responseHandler';
import { AuthRequest } from '../middleware/auth.middleware';
import { currentUser, queryParams, multerFiles } from './controller.helpers';
import * as purchaseRequestService from '../services/purchase-request.service';
import * as rfqService              from '../services/rfq.service';
import * as purchaseOrderService    from '../services/purchase-order.service';
import * as goodsReceivedService    from '../services/goods-received.service';
import * as vendorService           from '../services/vendor.service';
import { generateVendorsExcelReport } from '../services/vendor-excel.service';
import { AppError } from '../utils/AppError';

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE REQUEST
// ═══════════════════════════════════════════════════════════════════════════════
export const getPurchaseRequestStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await purchaseRequestService.getPurchaseRequestStats(currentUser(req));
  sendSuccess(res, stats, 'Purchase request stats retrieved');
});

export const getAllPurchaseRequests = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await purchaseRequestService.getPurchaseRequests(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Purchase requests retrieved');
});

export const getPurchaseRequestById = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await purchaseRequestService.getPurchaseRequestById(req.params.id);
  sendSuccess(res, request, 'Purchase request retrieved');
});

export const savePurchaseRequestDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await purchaseRequestService.savePurchaseRequest(req.body, currentUser(req));
  sendCreated(res, request, 'Purchase request draft saved');
});

export const createPurchaseRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await purchaseRequestService.saveAndSendPurchaseRequest(
    req.body, currentUser(req),
  );
  sendCreated(res, request, 'Purchase request submitted');
});

export const updatePurchaseRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await purchaseRequestService.updatePurchaseRequest(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, request, 'Purchase request updated');
});

export const updatePurchaseRequestStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await purchaseRequestService.updatePurchaseRequestStatus(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, request, 'Purchase request status updated');
});

export const deletePurchaseRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  await purchaseRequestService.deletePurchaseRequest(req.params.id);
  sendNoContent(res);
});

export const addPurchaseRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await purchaseRequestService.addComment(req.params.id, currentUser(req), req.body.text);
  sendCreated(res, comment, 'Comment added');
});

export const updatePurchaseRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await purchaseRequestService.updateComment(req.params.id, req.params.commentId, currentUser(req)._id, req.body.text);
  sendSuccess(res, comment, 'Comment updated');
});

export const deletePurchaseRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await purchaseRequestService.deleteComment(req.params.id, req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});

export const copyPurchaseRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const doc = await purchaseRequestService.purchaseRequestCopyService.copyDocument({
    currentUser: currentUser(req), requestId: req.params.id,
    requestType: 'purchaseRequest', requestTitle: 'Purchase Request', recipients: req.body.recipients,
  });
  sendSuccess(res, doc, 'Purchase request copied');
});

// ═══════════════════════════════════════════════════════════════════════════════
// RFQ
// ═══════════════════════════════════════════════════════════════════════════════
export const getRFQStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await rfqService.getRFQStats(currentUser(req));
  sendSuccess(res, stats, 'RFQ stats retrieved');
});

export const getAllRFQs = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await rfqService.getRFQs(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'RFQs retrieved');
});

export const getRFQById = catchAsync(async (req: AuthRequest, res: Response) => {
  const rfq = await rfqService.getRFQById(req.params.id);
  sendSuccess(res, rfq, 'RFQ retrieved');
});

export const getRFQByCode = catchAsync(async (req: AuthRequest, res: Response) => {
  const rfq = await rfqService.getRFQByCode(req.params.rfqCode);
  sendSuccess(res, rfq, 'RFQ retrieved');
});

export const saveRFQDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const rfq = await rfqService.saveRFQ(req.body, currentUser(req));
  sendCreated(res, rfq, 'RFQ draft saved');
});

export const createRFQ = catchAsync(async (req: AuthRequest, res: Response) => {
  const rfq = await rfqService.saveToSendRFQ(req.body, currentUser(req), multerFiles(req));
  sendCreated(res, rfq, 'RFQ created and saved for preview');
});

export const updateRFQ = catchAsync(async (req: AuthRequest, res: Response) => {
  const rfq = await rfqService.updateRFQ(req.params.id, req.body, currentUser(req), multerFiles(req));
  sendSuccess(res, rfq, 'RFQ updated');
});

export const updateRFQStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const { status } = req.body;
  const rfq = await rfqService.updateRFQStatus(req.params.id, status, currentUser(req));
  sendSuccess(res, rfq, `RFQ status updated to ${status}`);
});

// Plain JSON body: { recipients: string[], fileIds?: string[] }. The PDF is
// uploaded separately beforehand via POST /files/upload (associatedModel: 'RFQs').
export const sendRFQToVendors = catchAsync(async (req: AuthRequest, res: Response) => {
  const { recipients, fileIds } = req.body as {
    recipients?: string[];
    fileIds?: string[];
  };

  if (!recipients || !Array.isArray(recipients) || !recipients.length) {
    throw new AppError('At least one recipient is required', 400);
  }

  const rfq = await rfqService.copyRFQToVendors({
    currentUser: currentUser(req),
    requestId: req.params.id,
    recipients,
    fileIds: Array.isArray(fileIds) ? fileIds : [],
  });

  sendSuccess(res, rfq, 'RFQ sent to vendors successfully');
});

export const deleteRFQ = catchAsync(async (req: AuthRequest, res: Response) => {
  await rfqService.deleteRFQ(req.params.id);
  sendNoContent(res);
});
// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDER
// ═══════════════════════════════════════════════════════════════════════════════
export const getAllPurchaseOrders = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await purchaseOrderService.getPurchaseOrders(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Purchase orders retrieved');
});

export const getPurchaseOrderById = catchAsync(async (req: AuthRequest, res: Response) => {
  const po = await purchaseOrderService.getPurchaseOrderById(req.params.id);
  sendSuccess(res, po, 'Purchase order retrieved');
});

export const createPurchaseOrderFromRFQ = catchAsync(async (req: AuthRequest, res: Response) => {
  const po = await purchaseOrderService.createPurchaseOrderFromRFQ(
    req.params.rfqId,
    req.params.vendorId,
    req.body,
    currentUser(req),
   
  );
  sendCreated(res, po, 'Purchase order created from RFQ');
});

export const createIndependentPurchaseOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const po = await purchaseOrderService.createIndependentPurchaseOrder(
    req.body, currentUser(req),
  );
  sendCreated(res, po, 'Purchase order created');
});

export const updatePurchaseOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  const po = await purchaseOrderService.updatePurchaseOrder(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, po, 'Purchase order updated');
});

// purchaseOrderService.updatePurchaseOrderStatus is the workflow factory's
// plain updateStatus(id, data, user) — it no longer handles vendor emailing
// or files at all. That's now sendPurchaseOrderToVendor's job, below.
export const updatePurchaseOrderStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const po = await purchaseOrderService.updatePurchaseOrderStatus(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, po, 'Purchase order status updated');
});

// FIX (was the source of the TS2345 "CurrentUser is not assignable to
// parameter of type 'string'" error at the old line 207): purchase-order.
// service.ts's sendPurchaseOrderToVendor takes ONE destructured object
// argument — { purchaseOrderId, vendorId, fileIds, currentUser } — not
// positional arguments. Calling it positionally pushes currentUser(req)
// into whatever parameter slot the object was expected in, which is a
// string-typed param on every other call in this file, hence the error.
export const sendPurchaseOrderToVendor = catchAsync(async (req: AuthRequest, res: Response) => {
  const { vendorId, fileIds } = req.body as { vendorId?: string; fileIds?: string[] };

  if (!vendorId) {
    throw new AppError('vendorId is required', 400);
  }

  // BUG FIX: the route is `poRouter.post('/:purchaseOrderId/send-to-vendor', ...)`
  // (see procurement.routes.ts), so Express populates req.params.purchaseOrderId —
  // NOT req.params.id. Reading req.params.id here silently passed `undefined`
  // through to PurchaseOrder.findById(undefined), which Mongoose resolves to
  // null without ever querying the DB — hence the misleading "Purchase Order
  // not found" on an id that clearly existed in the request body/debug log.
  const result = await purchaseOrderService.sendPurchaseOrderToVendor({
    purchaseOrderId: req.params.purchaseOrderId,
    vendorId,
    fileIds: Array.isArray(fileIds) ? fileIds : [],
    currentUser: currentUser(req),
  });

  sendSuccess(res, result, 'Purchase order sent to vendor');
});

export const addPurchaseOrderComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const po = await purchaseOrderService.addCommentToPurchaseOrder(
    req.params.id, currentUser(req), req.body.text,
  );
  sendCreated(res, po, 'Comment added');
});

export const updatePurchaseOrderComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await purchaseOrderService.updatePurchaseOrderComment(req.params.id, req.params.commentId, currentUser(req)._id, req.body.text);
  sendSuccess(res, comment, 'Comment updated');
});

export const deletePurchaseOrderComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await purchaseOrderService.deletePurchaseOrderComment(req.params.id, req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});

export const deletePurchaseOrder = catchAsync(async (req: AuthRequest, res: Response) => {
  await purchaseOrderService.deletePurchaseOrder(req.params.id);
  sendNoContent(res);
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOODS RECEIVED
// ═══════════════════════════════════════════════════════════════════════════════
export const getAllGoodsReceived = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await goodsReceivedService.getGoodsReceivedNotes(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Goods received notes retrieved');
});

export const getGoodsReceivedById = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await goodsReceivedService.getGoodsReceivedById(req.params.id);
  sendSuccess(res, result, 'Goods received note retrieved');
});

export const getGoodsReceivedByPO = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await goodsReceivedService.getGoodsReceivedByPurchaseOrder(req.params.poId);
  sendSuccess(res, result, 'Goods received notes retrieved');
});

export const checkGRNExists = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await goodsReceivedService.checkGRNExists(req.params.poId);
  sendSuccess(res, result, 'GRN status checked');
});

export const createGoodsReceived = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await goodsReceivedService.createGoodsReceived(
    req.body, currentUser(req),
  );
  sendCreated(res, result, result.message || 'Goods received note created');
});

export const updateGoodsReceived = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await goodsReceivedService.updateGoodsReceived(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, result, result.message || 'Goods received note updated');
});

export const deleteGoodsReceived = catchAsync(async (req: AuthRequest, res: Response) => {
  await goodsReceivedService.deleteGoodsReceived(req.params.id);
  sendNoContent(res);
});

export const getGRNSummary = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await goodsReceivedService.getGoodsReceivedSummary(
    req.query.poId as string | undefined,
  );
  sendSuccess(res, result, 'GRN summary retrieved');
});

// ═══════════════════════════════════════════════════════════════════════════════
// VENDOR
// ═══════════════════════════════════════════════════════════════════════════════
export const getVendorStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await vendorService.getVendorStats(currentUser(req));
  sendSuccess(res, stats, 'Vendor stats retrieved');
});

export const getAllVendors = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await vendorService.getVendors(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Vendors retrieved');
});

export const getVendorById = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await vendorService.getVendorById(req.params.id);
  sendSuccess(res, vendor, 'Vendor retrieved');
});

export const saveVendorDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await vendorService.saveVendorDraft(req.body, currentUser(req));
  sendCreated(res, vendor, 'Vendor draft saved');
});

export const submitVendor = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await vendorService.submitVendor(req.body, currentUser(req));
  sendCreated(res, vendor, 'Vendor submitted');
});

export const updateVendor = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await vendorService.updateVendor(req.params.id, req.body, currentUser(req));
  sendSuccess(res, vendor, 'Vendor updated');
});

export const updateVendorStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await vendorService.updateVendorStatus(req.params.id, req.body, currentUser(req));
  sendSuccess(res, vendor, 'Vendor status updated');
});

export const addVendorComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await vendorService.addVendorComment(req.params.id, currentUser(req), req.body.text);
  sendCreated(res, comment, 'Comment added');
});

export const updateVendorComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await vendorService.updateVendorComment(req.params.id, req.params.commentId, currentUser(req)._id, req.body.text);
  sendSuccess(res, comment, 'Comment updated');
});

export const deleteVendorComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await vendorService.deleteVendorComment(req.params.id, req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});

export const deleteVendor = catchAsync(async (req: AuthRequest, res: Response) => {
  await vendorService.deleteVendor(req.params.id);
  sendNoContent(res);
});

// ─── Super-admin/Admin: Export vendors to Excel ──────────────────────────────
export const exportVendorsExcel = catchAsync(async (_req: AuthRequest, res: Response) => {
  await generateVendorsExcelReport(res);
});