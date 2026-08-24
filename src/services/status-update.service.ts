import mongoose, { Model } from 'mongoose';
import { notify } from './notifications/notification.service';
import { CurrentUser, StatusUpdatePayload } from './shared/types';
import { buildComment } from './shared/helpers';

// ─── Status update service ────────────────────────────────────────────────────
// Handles both generic (3-step: pending → reviewed → approved) and
// purchase-request (2-reviewer + 1-approver) workflows.

interface UpdateParams {
  Model: Model<any>;
  id: string;
  data: StatusUpdatePayload;
  currentUser: CurrentUser;
  requestType: string;
  title: string;
}

class StatusUpdateService {
  // ── Entry point ──────────────────────────────────────────────────────────
  async updateRequestStatusWithComment(params: UpdateParams): Promise<any> {
    const { Model, id, data, currentUser, requestType, title } = params;

    const document = await Model.findById(id);
    if (!document) throw new Error('Document not found');

    const previousStatus: string = document.status;
    const newStatus: string | undefined = data.status;

    // Detect creator field
    const creatorField = this.getCreatorField(document);
    const creatorId: mongoose.Types.ObjectId | undefined = document[creatorField];

    // Add comment if supplied
    if (data.comment?.trim()) {
      if (!document.comments) document.comments = [];
      document.comments.unshift(buildComment(currentUser._id, data.comment));
    }

    // Route to specialised or generic handler
    let completedReviewType: string | null = null;
    let completedReviewStatus: string | null = null;
    let otherReviewerId: mongoose.Types.ObjectId | null = null;

    if (requestType === 'purchaseRequest') {
      const result = this.handlePurchaseRequestStatus({ document, data, currentUser, previousStatus, newStatus });
      completedReviewType   = result.completedReviewType;
      completedReviewStatus = result.completedReviewStatus;
      otherReviewerId       = result.otherReviewerId;
    } else {
      this.handleGenericStatus({ document, data, currentUser, newStatus });
    }

    const updated = await document.save();

    // Notifications
    await this.sendNotifications({
      document: updated,
      previousStatus,
      newStatus: updated.status,
      currentUser,
      requestType,
      title,
      creatorId,
      creatorField,
      assignedApprover: data.approvedBy,
      completedReviewType,
      completedReviewStatus,
      otherReviewerId,
    });

    return updated;
  }

  // ── Generic 3-step workflow ───────────────────────────────────────────────
  private handleGenericStatus(opts: {
    document: any;
    data: StatusUpdatePayload;
    currentUser: CurrentUser;
    newStatus?: string;
  }): void {
    const { document, data, currentUser, newStatus } = opts;
    if (!newStatus) return;

    document.status = newStatus;

    if (newStatus === 'reviewed') {
      document.reviewedBy = currentUser._id;
      document.approvedBy = null;
    }
    if (newStatus === 'approved') {
      document.approvedBy = currentUser._id;
    }
    if (data.approvedBy && newStatus === 'reviewed') {
      document.approvedBy = data.approvedBy;
    }
  }

  // ── Purchase-request 2-reviewer workflow ─────────────────────────────────
  private handlePurchaseRequestStatus(opts: {
    document: any;
    data: StatusUpdatePayload;
    currentUser: CurrentUser;
    previousStatus: string;
    newStatus?: string;
  }): {
    completedReviewType: string | null;
    completedReviewStatus: string | null;
    otherReviewerId: mongoose.Types.ObjectId | null;
  } {
    const { document, data, currentUser, newStatus } = opts;
    let completedReviewType: string | null = null;
    let completedReviewStatus: string | null = null;

    const isFinanceReviewer =
      document.financeReviewBy?.toString() === currentUser._id.toString();
    const isProcurementReviewer =
      document.procurementReviewBy?.toString() === currentUser._id.toString();

    // Finance review
    if (data.financeReviewStatus && isFinanceReviewer) {
      document.financeReviewStatus = data.financeReviewStatus;
      if (['approved', 'rejected'].includes(data.financeReviewStatus)) {
        completedReviewType   = 'finance';
        completedReviewStatus = data.financeReviewStatus;
      }
    }

    // Procurement review
    if (data.procurementReviewStatus && isProcurementReviewer) {
      document.procurementReviewStatus = data.procurementReviewStatus;
      if (['approved', 'rejected'].includes(data.procurementReviewStatus)) {
        completedReviewType   = 'procurement';
        completedReviewStatus = data.procurementReviewStatus;
      }
    }

    // The "other" reviewer relative to whichever review just completed —
    // this is who gets notified whether they're the one still pending
    // (awaiting-second-review case) or the one who already decided
    // (rejection / ready-for-final-approval cases).
    let otherReviewerId: mongoose.Types.ObjectId | null = null;
    if (completedReviewType === 'finance') {
      otherReviewerId = document.procurementReviewBy ?? null;
    } else if (completedReviewType === 'procurement') {
      otherReviewerId = document.financeReviewBy ?? null;
    }

    // Main status — only the designated approver may change it
    if (newStatus) {
      const isApprover = document.approvedBy?.toString() === currentUser._id.toString();
      if (isApprover && document.status === 'reviewed') {
        document.status = newStatus;
        if (newStatus === 'approved') document.approvedBy = currentUser._id;
      }
    }

    // Either reviewer rejected → whole request rejected
    if (
      document.financeReviewStatus === 'rejected' ||
      document.procurementReviewStatus === 'rejected'
    ) {
      document.status = 'rejected';
      return { completedReviewType, completedReviewStatus, otherReviewerId };
    }

    // Both approved → move to reviewed
    if (
      document.financeReviewStatus === 'approved' &&
      document.procurementReviewStatus === 'approved' &&
      document.status === 'pending'
    ) {
      document.status    = 'reviewed';
      document.reviewedBy = currentUser._id;
    }

    // NOTE: assigning `approvedBy` is intentionally NOT done here. Per the
    // workflow spec, only createdBy assigns the approver (via
    // updatePurchaseRequest) once the request reaches "reviewed" — a
    // reviewer should not be able to set it as a side effect of submitting
    // their review decision.

    return { completedReviewType, completedReviewStatus, otherReviewerId };
  }

  // ── Creator field detection ───────────────────────────────────────────────
  private getCreatorField(document: any): string {
    if (document.createdBy)    return 'createdBy';
    if (document.user)         return 'user';
    return 'createdBy';
  }

  // ── Notification routing ──────────────────────────────────────────────────
  private async sendNotifications(opts: {
    document: any;
    previousStatus: string;
    newStatus: string;
    currentUser: CurrentUser;
    requestType: string;
    title: string;
    creatorId?: mongoose.Types.ObjectId;
    creatorField: string;
    assignedApprover?: string;
    completedReviewType: string | null;
    completedReviewStatus: string | null;
    otherReviewerId: mongoose.Types.ObjectId | null;
  }): Promise<void> {
    const base = {
      request: opts.document,
      currentUser: opts.currentUser,
      requestType: opts.requestType,
      title: opts.title,
    };

    if (opts.requestType === 'purchaseRequest') {
      await this.sendPurchaseRequestNotifications({ ...opts, base });
      return;
    }

    if (opts.previousStatus === opts.newStatus) return;

    const notCreator = opts.creatorId?.toString() !== opts.currentUser._id.toString();

    switch (opts.newStatus) {
      case 'reviewed':
        if (notCreator) notify.notifyCreator({ ...base, header: 'Your request has been reviewed' }).catch(console.error);
        if (opts.assignedApprover) notify.notifyApprovers({ ...base, header: 'A request has been reviewed and needs your approval' }).catch(console.error);
        break;

      case 'approved':
        if (notCreator) notify.notifyCreator({ ...base, header: 'Your request has been APPROVED' }).catch(console.error);
        if (opts.document.reviewedBy?.toString() !== opts.currentUser._id.toString()) {
          notify.notifyReviewers({ ...base, header: 'A request you reviewed has been APPROVED' }).catch(console.error);
        }
        break;

      case 'rejected':
        if (notCreator) notify.notifyCreator({ ...base, header: 'Your request has been REJECTED' }).catch(console.error);
        if (
          (opts.previousStatus === 'reviewed' || opts.previousStatus === 'approved') &&
          opts.document.reviewedBy?.toString() !== opts.currentUser._id.toString()
        ) {
          notify.notifyReviewers({ ...base, header: 'A request you reviewed has been REJECTED' }).catch(console.error);
        }
        break;

      default:
        if (notCreator && opts.creatorId) {
          notify.notifyCreator({ ...base, header: `Your request status has been updated to ${opts.newStatus}` }).catch(console.error);
        }
    }
  }

  // ── Purchase-request specific notifications ───────────────────────────────
  private async sendPurchaseRequestNotifications(opts: any): Promise<void> {
    const base = opts.base;

    // Step 2/3: a single review decision just completed.
    if (opts.completedReviewType && opts.completedReviewStatus) {
      if (opts.completedReviewStatus === 'rejected') {
        // Notifies createdBy + the other reviewer (whoever didn't just reject).
        notify.notifyReviewRejection({
          ...base,
          rejectingReviewType: opts.completedReviewType,
          otherReviewerId: opts.otherReviewerId,
          header: 'Purchase request rejected during review',
        }).catch(console.error);
      } else {
        const otherStatus = opts.completedReviewType === 'finance'
          ? opts.document.procurementReviewStatus
          : opts.document.financeReviewStatus;

        if (otherStatus === 'pending') {
          // Notifies createdBy + the reviewer who hasn't decided yet.
          notify.notifyAwaitingSecondReview({
            ...base,
            completedReviewType: opts.completedReviewType,
            completedReviewStatus: opts.completedReviewStatus,
            pendingReviewerId: opts.otherReviewerId,
            header: 'One review done, awaiting second',
          }).catch(console.error);
        } else if (otherStatus === 'approved') {
          // Second decision matches the first → notifies createdBy + the
          // reviewer who decided first.
          notify.notifyReadyForFinalApproval({
            ...base,
            firstDeciderId: opts.otherReviewerId,
            header: 'Both reviews complete — awaiting final approval',
          }).catch(console.error);
        }
      }
    }

    // Step 5: the approver's final decision. Gated on previousStatus being
    // 'reviewed' — that's the only state from which the approver is allowed
    // to change status (see handlePurchaseRequestStatus), so this can never
    // double-fire alongside a reviewer-stage rejection (previousStatus
    // 'pending' → 'rejected'), which is handled by notifyReviewRejection above.
    if (
      (opts.newStatus === 'approved' || opts.newStatus === 'rejected') &&
      opts.previousStatus === 'reviewed'
    ) {
      const ids: mongoose.Types.ObjectId[] = [];
      if (opts.creatorId) ids.push(opts.creatorId);
      if (opts.document.financeReviewBy) ids.push(opts.document.financeReviewBy);
      if (opts.document.procurementReviewBy) ids.push(opts.document.procurementReviewBy);
      if (ids.length) {
        notify.notifyPurchaseRequestUsers({ ...base, header: `Purchase request has been ${opts.newStatus.toUpperCase()}`, recipientIds: ids }).catch(console.error);
      }
    }
  }
}

export const statusUpdateService = new StatusUpdateService();

// ─── Simple single-step approval service (for StaffStrategy, PurchaseOrder) ──
class SimpleStatusUpdateService {
  async updateStatus(params: UpdateParams): Promise<any> {
    const { Model, id, data, currentUser, requestType, title } = params;

    const document = await Model.findById(id);
    if (!document) throw new Error('Document not found');

    const { status, comment } = data;

    if (!['pending', 'approved', 'rejected', 'draft'].includes(status)) {
      throw new Error('Invalid status');
    }

    if (comment?.trim()) {
      if (!document.comments) document.comments = [];
      document.comments.unshift(buildComment(currentUser._id, comment));
    }

    const previousStatus: string = document.status;
    document.status = status;

    if (status === 'approved') document.approvedBy = currentUser._id;
    document.updatedAt = new Date();

    const updated = await document.save();

    if (status !== 'draft') {
      await this.notify(updated, previousStatus, status, currentUser, requestType, title);
    }

    return updated;
  }

  private async notify(
    document: any,
    previousStatus: string,
    newStatus: string,
    currentUser: CurrentUser,
    requestType: string,
    title: string,
  ): Promise<void> {
    if (previousStatus === newStatus) return;

    const base = { request: document, currentUser, requestType, title };
    const creatorId = document.createdBy;
    const notCreator = creatorId?.toString() !== currentUser._id.toString();

    if (newStatus === 'approved') {
      if (notCreator) notify.notifyCreator({ ...base, header: `Your ${title} has been APPROVED` }).catch(console.error);
    } else if (newStatus === 'rejected') {
      if (notCreator) notify.notifyCreator({ ...base, header: `Your ${title} has been REJECTED` }).catch(console.error);
    } else if (newStatus === 'pending' && document.approvedBy) {
      notify.notifyApprovers({ ...base, header: `You have been assigned a ${title} for approval` }).catch(console.error);
    }
  }
}

export const simpleStatusUpdateService = new SimpleStatusUpdateService();