// services/statusUpdateService.js
const notify = require("../utils/notify");

class StatusUpdateService {
  /**
   * Reusable status update handler for all request types
   * @param {Object} options
   * @param {mongoose.Model} options.Model - Mongoose model
   * @param {string} options.id - Document ID
   * @param {Object} options.data - Update data
   * @param {Object} options.currentUser - Current user
   * @param {string} options.requestType - Request type key
   * @param {string} options.title - Request title for notifications
   * @returns {Promise<Object>} Updated document
   */
  async updateRequestStatus({
    Model,
    id,
    data,
    currentUser,
    requestType,
    title,
  }) {
    // Find the document
    const document = await Model.findById(id);
    if (!document) {
      throw new Error("Document not found");
    }

    const previousStatus = document.status;
    const newStatus = data.status;

    // Determine creator field name based on model
    const creatorField = this._getCreatorField(document);
    const creatorId = document[creatorField];

    // Add comment if provided
    if (data.comment) {
      if (!document.comments) {
        document.comments = [];
      }

      document.comments.unshift({
        user: currentUser._id,
        text: data.comment.trim(),
        edited: false,
        deleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Handle status transitions
    if (newStatus) {
      document.status = newStatus;

      // Set reviewedBy when status changes to "reviewed"
      if (newStatus === "reviewed") {
        document.reviewedBy = currentUser._id;
        document.approvedBy = null; // Clear previous approval if any
      }

      // Set approvedBy when status changes to "approved"
      if (newStatus === "approved") {
        document.approvedBy = currentUser._id;
      }

      // Handle rejection logic
      if (newStatus === "rejected") {
        this._handleRejection(document, previousStatus, currentUser);
      }

      // Update approvedBy if provided when status is "reviewed"
      if (data.approvedBy && newStatus === "reviewed") {
        document.approvedBy = data.approvedBy;
      }
    }

    // Save the updated document
    const updatedDocument = await document.save();

    // Send notifications based on status transition
    await this._sendNotifications({
      document: updatedDocument,
      previousStatus,
      newStatus,
      currentUser,
      requestType,
      title,
      creatorId,
      creatorField,
      assignedApprover: data.approvedBy,
    });

    return updatedDocument;
  }

  /**
   * Determine the creator field name
   * @private
   */
  _getCreatorField(document) {
    if (document.preparedBy) return "preparedBy";
    if (document.createdBy) return "createdBy";
    if (document.requestedBy) return "requestedBy";
    return "createdBy"; // default
  }

  /**
   * Handle rejection logic
   * @private
   */
  _handleRejection(document, previousStatus, currentUser) {
    // Reset reviewedBy if rejected by reviewer
    if (previousStatus === "pending" || previousStatus === "reviewed") {
      if (
        document.reviewedBy &&
        document.reviewedBy.toString() === currentUser._id.toString()
      ) {
        document.reviewedBy = null;
      }
    }

    // Reset approvedBy if rejected by approver
    if (previousStatus === "approved") {
      if (
        document.approvedBy &&
        document.approvedBy.toString() === currentUser._id.toString()
      ) {
        document.approvedBy = null;
      }
    }
  }

  /**
   * Send appropriate notifications
   * @private
   */
  async _sendNotifications({
    document,
    previousStatus,
    newStatus,
    currentUser,
    requestType,
    title,
    creatorId,
    creatorField,
    assignedApprover,
  }) {
    // No notification if status didn't change
    if (previousStatus === newStatus) return;

    switch (newStatus) {
      case "reviewed":
        await this._notifyOnReviewed({
          document,
          currentUser,
          requestType,
          title,
          creatorId,
          assignedApprover,
        });
        break;

      case "approved":
        await this._notifyOnApproved({
          document,
          currentUser,
          requestType,
          title,
          creatorId,
        });
        break;

      case "rejected":
        await this._notifyOnRejected({
          document,
          previousStatus,
          currentUser,
          requestType,
          title,
          creatorId,
        });
        break;

      default:
        // For other status changes, notify creator
        if (creatorId && creatorId.toString() !== currentUser._id.toString()) {
          notify.notifyCreator({
            request: document,
            currentUser,
            requestType,
            title,
            header: `Your request status has been updated to ${newStatus}`,
          });
        }
    }
  }

  /**
   * Notifications when status changes to "reviewed"
   * @private
   */
  async _notifyOnReviewed({
    document,
    currentUser,
    requestType,
    title,
    creatorId,
    assignedApprover,
  }) {
    // Notify creator
    if (creatorId && creatorId.toString() !== currentUser._id.toString()) {
      notify.notifyCreator({
        request: document,
        currentUser,
        requestType,
        title,
        header: "Your request has been reviewed",
      });
    }

    // Notify assigned approver if provided
    if (
      assignedApprover &&
      assignedApprover.toString() !== currentUser._id.toString()
    ) {
      notify.notifyApprovers({
        request: document,
        currentUser,
        requestType,
        title,
        header: "A request has been reviewed and needs your approval",
      });
    }
  }

  /**
   * Notifications when status changes to "approved"
   * @private
   */
  async _notifyOnApproved({
    document,
    currentUser,
    requestType,
    title,
    creatorId,
  }) {
    // Notify creator
    if (creatorId && creatorId.toString() !== currentUser._id.toString()) {
      notify.notifyCreator({
        request: document,
        currentUser,
        requestType,
        title,
        header: "Your request has been APPROVED",
      });
    }

    // Notify reviewer (if different from current user)
    if (
      document.reviewedBy &&
      document.reviewedBy.toString() !== currentUser._id.toString()
    ) {
      notify.notifyReviewers({
        request: document,
        currentUser,
        requestType,
        title,
        header: "A request you reviewed has been APPROVED",
      });
    }
  }

  /**
   * Notifications when status changes to "rejected"
   * @private
   */
  async _notifyOnRejected({
    document,
    previousStatus,
    currentUser,
    requestType,
    title,
    creatorId,
  }) {
    // Always notify creator (if not the one rejecting)
    if (creatorId && creatorId.toString() !== currentUser._id.toString()) {
      notify.notifyCreator({
        request: document,
        currentUser,
        requestType,
        title,
        header: "Your request has been REJECTED",
      });
    }

    // If rejected by approver, notify reviewer
    const isRejectedByApprover =
      previousStatus === "reviewed" || previousStatus === "approved";
    if (
      isRejectedByApprover &&
      document.reviewedBy &&
      document.reviewedBy.toString() !== currentUser._id.toString()
    ) {
      notify.notifyReviewers({
        request: document,
        currentUser,
        requestType,
        title,
        header: "A request you reviewed has been REJECTED",
      });
    }
  }
}

module.exports = new StatusUpdateService();
