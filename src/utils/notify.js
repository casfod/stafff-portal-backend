const notificationService = require("../services/notificationService");

class Notify {
  async notifyReviewers({ request, currentUser, requestType, title }) {
    if (request.status === "pending") return;

    const recipients = [request.reviewedBy].filter(Boolean);
    if (!recipients.length) return;

    await notificationService.sendRequestNotification({
      currentUser,
      requestData: request.toObject(),
      recipientIds: recipients,
      requestType: requestType,
      title: title,
    });
  }
  async notifyApprovers({ request, currentUser, requestType, title }) {
    if (request.status === "pending" || request.status === "reviewed") return;

    const recipients = [request.approvedBy].filter(Boolean);
    if (!recipients.length) return;

    await NotificationService.sendRequestNotification({
      currentUser,
      requestData: request.toObject(),
      recipientIds: recipients,
      requestType: requestType,
      title: title,
    });
  }
  async sendStatusNotification({ request, currentUser, requestType, title }) {
    const creatorId = request.preparedBy || request.createdBy;
    if (!creatorId) return;

    await NotificationService.sendRequestNotification({
      currentUser,
      requestData: request.toObject(),
      recipientIds: [creatorId],
      requestType: requestType,
      title: title,
    });
  }
}

module.exports = new Notify();
