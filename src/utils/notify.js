const notificationService = require("../services/notificationService");

class Notify {
  /**
   * Common notification handler for all types
   * @private
   */
  async _sendNotification({
    request,
    currentUser,
    recipientIds,
    requestType,
    title,
    header,
  }) {
    if (!recipientIds.length) return;

    try {
      await notificationService.sendRequestNotification({
        currentUser,
        requestData: request.toObject(),
        recipientIds,
        requestType,
        title,
        header,
      });
    } catch (error) {
      console.error(`Notification failed for ${requestType}:`, error);
      // Consider adding error reporting here
    }
  }

  /**
   * Notify reviewers when request needs review
   */
  async notifyReviewers({ request, currentUser, requestType, title, header }) {
    // Only notify if there's a reviewer assigned
    if (!request.reviewedBy) return;

    // Don't notify if the current user is the reviewer
    if (request.reviewedBy.toString() === currentUser._id.toString()) return;

    await this._sendNotification({
      request,
      currentUser,
      recipientIds: [request.reviewedBy],
      requestType,
      title,
      header,
    });
  }

  /**
   * Notify approvers when request needs approval
   */
  async notifyApprovers({ request, currentUser, requestType, title, header }) {
    // Only notify if there's an approver assigned
    if (!request.approvedBy) return;

    // Don't notify if the current user is the approver
    if (request.approvedBy.toString() === currentUser._id.toString()) return;

    await this._sendNotification({
      request,
      currentUser,
      recipientIds: [request.approvedBy],
      requestType,
      title,
      header,
    });
  }

  /**
   * Notify creator about status changes
   */
  async notifyCreator({ request, currentUser, requestType, title, header }) {
    const creatorId =
      request.preparedBy || request.createdBy || request.requestedBy;
    if (!creatorId) return;

    // Don't notify if the current user is the creator
    if (creatorId.toString() === currentUser._id.toString()) return;

    await this._sendNotification({
      request,
      currentUser,
      recipientIds: [creatorId],
      requestType,
      title,
      header,
    });
  }

  /**
   * Comprehensive notification handler
   */
  async notifyAllParties({ request, currentUser, requestType, title, header }) {
    await Promise.all([
      this.notifyReviewers({
        request,
        currentUser,
        requestType,
        title,
        header,
      }),
      this.notifyApprovers({
        request,
        currentUser,
        requestType,
        title,
        header,
      }),
      this.notifyCreator({ request, currentUser, requestType, title, header }),
    ]);
  }

  /**
   * Notify purchase request reviewers (finance and procurement)
   */
  async notifyPurchaseRequestReviewers({
    request,
    currentUser,
    requestType,
    title,
    header,
  }) {
    const recipientIds = [];

    // Add finance reviewer if exists
    if (request.financeReviewBy) {
      recipientIds.push(request.financeReviewBy);
    }

    // Add procurement reviewer if exists
    if (request.procurementReviewBy) {
      recipientIds.push(request.procurementReviewBy);
    }

    // Don't notify if no reviewers assigned
    if (recipientIds.length === 0) return;

    await this._sendNotification({
      request,
      currentUser,
      recipientIds,
      requestType,
      title,
      header,
    });
  }

  /**
   * Notify specific user(s) about purchase request status
   */
  async notifyPurchaseRequestUsers({
    request,
    currentUser,
    requestType,
    title,
    header,
    recipientIds,
  }) {
    if (!recipientIds || !recipientIds.length) return;

    await this._sendNotification({
      request,
      currentUser,
      recipientIds,
      requestType,
      title,
      header,
    });
  }

  /**
   * Notify when one review is completed and awaiting the other
   */
  async notifyAwaitingSecondReview({
    request,
    currentUser,
    requestType,
    title,
    completedReviewType, // 'finance' or 'procurement'
    completedReviewStatus, // 'approved' or 'rejected'
  }) {
    const recipientIds = [];
    let header = "";

    // Determine who needs to be notified
    if (completedReviewType === "finance") {
      // Notify creator and procurement reviewer
      const creatorId = request.createdBy;
      if (creatorId) recipientIds.push(creatorId);

      if (request.procurementReviewBy) {
        recipientIds.push(request.procurementReviewBy);
        header =
          completedReviewStatus === "approved"
            ? "Finance review completed - Awaiting procurement review"
            : "Finance review rejected - Procurement review not required";
      }
    } else if (completedReviewType === "procurement") {
      // Notify creator and finance reviewer
      const creatorId = request.createdBy;
      if (creatorId) recipientIds.push(creatorId);

      if (request.financeReviewBy) {
        recipientIds.push(request.financeReviewBy);
        header =
          completedReviewStatus === "approved"
            ? "Procurement review completed - Awaiting finance review"
            : "Procurement review rejected - Finance review not required";
      }
    }

    if (recipientIds.length > 0 && header) {
      await this._sendNotification({
        request,
        currentUser,
        recipientIds,
        requestType,
        title,
        header,
      });
    }
  }

  /**
   * Notify when both reviews are approved and request is ready for final approval
   */
  async notifyReadyForFinalApproval({
    request,
    currentUser,
    requestType,
    title,
  }) {
    const recipientIds = [];

    // Notify creator
    if (request.createdBy) {
      recipientIds.push(request.createdBy);
    }

    // Notify both reviewers
    if (request.financeReviewBy) {
      recipientIds.push(request.financeReviewBy);
    }
    if (request.procurementReviewBy) {
      recipientIds.push(request.procurementReviewBy);
    }

    // Notify approver if assigned
    if (request.approvedBy) {
      await this.notifyApprovers({
        request,
        currentUser,
        requestType,
        title,
        header:
          "Finance and procurement reviews completed - Awaiting final decision",
      });
    }

    if (recipientIds.length > 0) {
      await this._sendNotification({
        request,
        currentUser,
        recipientIds,
        requestType,
        title,
        header: "Both reviews completed - Request ready for final approval",
      });
    }
  }

  /**
   * Notify when request is rejected by either reviewer
   */
  async notifyReviewRejection({
    request,
    currentUser,
    requestType,
    title,
    rejectingReviewType, // 'finance' or 'procurement'
  }) {
    const recipientIds = [];

    // Always notify creator
    if (request.createdBy) {
      recipientIds.push(request.createdBy);
    }

    // Notify the other reviewer
    if (rejectingReviewType === "finance" && request.procurementReviewBy) {
      recipientIds.push(request.procurementReviewBy);
    } else if (
      rejectingReviewType === "procurement" &&
      request.financeReviewBy
    ) {
      recipientIds.push(request.financeReviewBy);
    }

    if (recipientIds.length > 0) {
      await this._sendNotification({
        request,
        currentUser,
        recipientIds,
        requestType,
        title,
        header: "Purchase request has been rejected",
      });
    }
  }
}

module.exports = new Notify();
