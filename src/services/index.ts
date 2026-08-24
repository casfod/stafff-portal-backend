// ─── Infrastructure ───────────────────────────────────────────────────────────
export { emailService } from "./email.service";
export { fileService } from "./file.service";
export { notify } from "./notifications/notification.service";
export { BaseCopyService } from "./base-copy.service";
export {
  statusUpdateService,
  simpleStatusUpdateService,
} from "./status-update.service";
export { OwnershipService } from "./ownership.service";

// ─── Shared types & helpers ───────────────────────────────────────────────────
export type {
  CurrentUser,
  PopulatedUser,
  FileDoc,
  BaseQueryParams,
  PaginatedResult,
  StatusUpdatePayload,
} from "./shared/types";
export {
  buildRoleVisibilityQuery,
  buildComment,
  filterDeleted,
  cleanObjectId,
} from "./shared/helpers";
export {
  addCommentOp,
  updateCommentOp,
  deleteCommentOp,
} from "./shared/comment-ops";
export { createWorkflowService } from "./shared/workflow-service.factory";

// ─── Auth ─────────────────────────────────────────────────────────────────────
export { authService } from "./auth.service";
export { userService } from "./user.service";
export { cloudinaryService } from "./cloudinary.service";

// ─── HR ───────────────────────────────────────────────────────────────────────
export * as leaveService from "./leave.service";
export * as staffStrategyService from "./staff-strategy.service";
export * as appraisalService from "./appraisal.service";
export {
  LEAVE_TYPE_CONFIG,
  calculateDaysBetween,
  validateLeaveApplication,
} from "./leave.service";

// ─── Finance ──────────────────────────────────────────────────────────────────
export * as conceptNoteService from "./concept-note.service";
export * as advanceRequestService from "./advance-request.service";
export * as expenseClaimsService from "./expense-claims.service";
export * as travelRequestService from "./travel-request.service";
export * as paymentRequestService from "./payment-request.service";
export * as paymentVoucherService from "./payment-voucher.service";

// ─── Procurement ──────────────────────────────────────────────────────────────
export * as purchaseRequestService from "./purchase-request.service";
export * as rfqService from "./rfq.service";
export * as purchaseOrderService from "./purchase-order.service";
export * as goodsReceivedService from "./goods-received.service";

// ─── Settings / Admin ─────────────────────────────────────────────────────────
export * as projectService from "./project.service";
export * as systemSettingsService from "./system-settings.service";
export * as employmentInfoService from "./employment-info.service";
export { generateUsersExcelReport } from "./user-excel.service";
