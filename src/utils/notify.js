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
    // Allow notifications for pending, approved, and rejected states
    if (!["pending", "approved", "rejected"].includes(request.status)) return;

    const recipients = [request.reviewedBy].filter(Boolean);
    await this._sendNotification({
      request,
      currentUser,
      recipientIds: recipients,
      requestType,
      title,
      header,
    });
  }

  /**
   * Notify approvers when request needs approval
   */
  async notifyApprovers({ request, currentUser, requestType, title, header }) {
    const recipients = [request.approvedBy].filter(Boolean);
    await this._sendNotification({
      request,
      currentUser,
      recipientIds: recipients,
      requestType,
      title,
      header,
    });
  }

  /**
   * Notify creator about status changes
   */
  async notifyCreator({ request, currentUser, requestType, title, header }) {
    // if (["pending", "approved", "rejected"].includes(request.status)) return;

    const creatorId = request.preparedBy || request.createdBy;
    if (!creatorId) return;

    await this._sendNotification({
      request,
      currentUser,
      recipientIds: [creatorId],
      requestType,
      title, // Differentiate status updates
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
}

module.exports = new Notify();
