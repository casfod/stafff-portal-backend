// src/services/notification.service.ts

import mongoose from "mongoose";
import { User } from "../../models";
import { emailService } from "../email.service";
import { env } from "../../config/env";
import { CurrentUser } from "../shared/types";

// ─── Request type → URL path mapping ─────────────────────────────────────────
const REQUEST_PATHS: Record<string, string> = {
  // Finance
  conceptNote: "concept-notes/request",
  purchaseRequest: "purchase-requests/request",
  paymentRequest: "payment-requests/request",
  advanceRequest: "advance-requests/request",
  travelRequest: "travel-requests/request",
  expenseClaim: "expense-claims/request",
  paymentVoucher: "finance/payment-voucher/payment-vouchers/voucher",

  // Procurement
  purchaseOrder: "procurement/purchase-order",
  rfq: "procurement/rfq",
  vendor: "procurement/vendor-management/vendor",

  // HR
  leave: "human-resources/leave",
  staffStrategy: "human-resources/staff-strategy",
  appraisal: "human-resources/appraisals",
};

// These links are always meant to open in the logged-in SPA (an internal
// user clicking a notification email), so they use env.FRONTEND_URL — NOT
// env.API_BASE_URL, which is reserved for links that must work with no
// session at all (vendor file downloads, see file.service.ts). Previously
// this read `process.env.BASE_URL ?? env.FRONTEND_URL`, an ad hoc fallback
// independent of file.service.ts's own ad hoc chain — two different
// unvalidated paths to what should be one decision. Now there's exactly
// one: env.FRONTEND_URL, validated once at boot in config/env.ts.
function requestUrl(requestType: string, requestId: string): string {
  const path = REQUEST_PATHS[requestType] ?? requestType;
  return `${env.FRONTEND_URL}/${path}/${requestId}`;
}

// ─── Shared notification payload ──────────────────────────────────────────────
interface NotifyParams {
  request: any;
  currentUser: CurrentUser;
  requestType: string;
  title: string;
  header: string;
  recipientIds?: mongoose.Types.ObjectId[];
  specificReviewer?: mongoose.Types.ObjectId | string | null;
  completedReviewType?: string;
  completedReviewStatus?: string;
  pendingReviewerId?: mongoose.Types.ObjectId | null;
  rejectingReviewType?: string;
  otherReviewerId?: mongoose.Types.ObjectId | null;
  firstDeciderId?: mongoose.Types.ObjectId | null;
}

// ─── Notification service ─────────────────────────────────────────────────────
class NotificationService {
  private async sendToUsers(
    recipientIds: (mongoose.Types.ObjectId | string)[],
    params: NotifyParams
  ): Promise<void> {
    try {
      const objectIds = recipientIds.map(id =>
        typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id
      );

      const uniqueIds = Array.from(
        new Map(objectIds.map((id) => [id.toString(), id])).values()
      );

      const recipients = await User.find({ _id: { $in: uniqueIds } })
        .select("email firstName lastName")
        .lean();

      if (!recipients.length) return;

      const url = requestUrl(params.requestType, params.request._id.toString());
      const actorName = `${params.currentUser.firstName} ${params.currentUser.lastName}`;

      await Promise.all(
        recipients.map((r) =>
          emailService
            .sendRequestNotification({
              recipientEmail: r.email,
              recipientName: `${r.firstName} ${r.lastName}`,
              subject: params.title,
              header: params.header,
              requestTitle: params.title,
              requestStatus: params.request.status,
              actorName,
              actorRole: params.currentUser.role,
              actorEmail: params.currentUser.email,
              requestUrl: url,
              isPending: params.request.status === "pending",
            })
            .catch((err) => console.error(`Failed to notify ${r.email}:`, err))
        )
      );
    } catch (err) {
      console.error("[NotificationService] sendToUsers error:", err);
    }
  }

  async notifyCreator(params: NotifyParams): Promise<void> {
    const creatorId =
      params.request.createdBy ??
      params.request.user ??
      params.request.staffId;

    if (!creatorId) return;
    await this.sendToUsers([creatorId], params);
  }

  async notifyReviewers(params: NotifyParams): Promise<void> {
    if (params.specificReviewer) {
      await this.sendToUsers([params.specificReviewer], params);
      return;
    }
    const reviewerId = params.request.reviewedBy;
    if (!reviewerId) return;
    await this.sendToUsers([reviewerId], params);
  }

  async notifyApprovers(params: NotifyParams): Promise<void> {
    const approverId = params.request.approvedBy;
    if (!approverId) return;
    await this.sendToUsers([approverId], params);
  }

  async notifyMultipleUsers(params: NotifyParams): Promise<void> {
    if (!params.recipientIds?.length) return;
    await this.sendToUsers(params.recipientIds, params);
  }

  async notifyPurchaseRequestReviewers(params: NotifyParams): Promise<void> {
    const ids: (mongoose.Types.ObjectId | string)[] = [];
    if (params.request.financeReviewBy)
      ids.push(params.request.financeReviewBy);
    if (params.request.procurementReviewBy)
      ids.push(params.request.procurementReviewBy);
    if (!ids.length) return;
    await this.sendToUsers(ids, params);
  }

  async notifyAwaitingSecondReview(
    params: NotifyParams & {
      completedReviewType: string;
      completedReviewStatus: string;
      pendingReviewerId?: mongoose.Types.ObjectId | null;
    }
  ): Promise<void> {
    const ids: (mongoose.Types.ObjectId | string)[] = [];
    if (params.request.createdBy) ids.push(params.request.createdBy);
    if (params.pendingReviewerId) ids.push(params.pendingReviewerId);
    if (!ids.length) return;

    const header = `${params.completedReviewType.charAt(0).toUpperCase() + params.completedReviewType.slice(1)} review ${params.completedReviewStatus}. Awaiting the other review.`;
    await this.sendToUsers(ids, { ...params, header });
  }

  async notifyReviewRejection(
    params: NotifyParams & {
      rejectingReviewType: string;
      otherReviewerId?: mongoose.Types.ObjectId | null;
    }
  ): Promise<void> {
    const ids: (mongoose.Types.ObjectId | string)[] = [];
    if (params.request.createdBy) ids.push(params.request.createdBy);
    if (params.otherReviewerId) ids.push(params.otherReviewerId);
    if (!ids.length) return;

    const header = `Your ${params.title} was REJECTED during ${params.rejectingReviewType} review.`;
    await this.sendToUsers(ids, { ...params, header });
  }

  async notifyPurchaseRequestUsers(params: NotifyParams): Promise<void> {
    if (!params.recipientIds?.length) return;
    await this.sendToUsers(params.recipientIds, params);
  }

  async notifyReadyForFinalApproval(
    params: NotifyParams & { firstDeciderId?: mongoose.Types.ObjectId | null }
  ): Promise<void> {
    const ids: (mongoose.Types.ObjectId | string)[] = [];
    if (params.request.createdBy) ids.push(params.request.createdBy);
    if (params.firstDeciderId) ids.push(params.firstDeciderId);
    if (!ids.length) return;

    await this.sendToUsers(ids, {
      ...params,
      header:
        "Both finance and procurement reviews are complete — ready for final approval.",
    });
  }

  async sendCopyNotification(opts: {
    originalSender: mongoose.Types.ObjectId;
    requestId: string;
    requestType: string;
    requestTitle: string;
    recipients: mongoose.Types.ObjectId[];
  }): Promise<void> {
    try {
      const [recipientUsers, sender] = await Promise.all([
        User.find({ _id: { $in: opts.recipients } })
          .select("email firstName lastName role")
          .lean(),
        User.findById(opts.originalSender)
          .select("firstName lastName email role")
          .lean(),
      ]);

      if (!recipientUsers.length || !sender) return;

      const ccEmails = recipientUsers
        .filter((r) => r.email !== sender.email)
        .map((r) => r.email);

      await emailService.sendCopyNotification({
        senderEmail: sender.email,
        ccEmails,
        subject: opts.requestTitle,
        senderName: `${sender.firstName} ${sender.lastName}`,
        senderRole: (sender as any).role,
        requestTitle: opts.requestTitle,
        requestUrl: requestUrl(opts.requestType, opts.requestId),
      });
    } catch (err) {
      console.error("[NotificationService] sendCopyNotification error:", err);
    }
  }
}

export const notify = new NotificationService();