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
}

module.exports = new Notify();
