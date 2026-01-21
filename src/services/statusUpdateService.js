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
  async updateRequestStatusWithComment({
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

    // Handle purchase request specific logic
    if (requestType === "purchaseRequest") {
      await this._handlePurchaseRequestStatus({
        document,
        data,
        currentUser,
        previousStatus,
        newStatus,
      });
    } else {
      // Handle other request types (original logic)
      await this._handleGenericRequestStatus({
        document,
        data,
        currentUser,
        newStatus,
      });
    }

    // Save the updated document
    const updatedDocument = await document.save();

    // Send notifications based on status transition
    await this._sendNotifications({
      document: updatedDocument,
      previousStatus,
      newStatus: updatedDocument.status, // Use updated status
      currentUser,
      requestType,
      title,
      creatorId,
      creatorField,
      assignedApprover: data.approvedBy,
    });

    return updatedDocument;
  }
  // In statusUpdateService.js, update the _handlePurchaseRequestStatus function:

  /**
   * Handle purchase request specific status logic
   * @private
   */
  async _handlePurchaseRequestStatus({
    document,
    data,
    currentUser,
    previousStatus,
    newStatus,
  }) {
    // Handle finance review status
    if (data.financeReviewStatus) {
      document.financeReviewStatus = data.financeReviewStatus;
      if (
        data.financeReviewStatus === "approved" ||
        data.financeReviewStatus === "rejected"
      ) {
        document.financeReviewBy = currentUser._id;
      }
    }

    // Handle procurement review status
    if (data.procurementReviewStatus) {
      document.procurementReviewStatus = data.procurementReviewStatus;
      if (
        data.procurementReviewStatus === "approved" ||
        data.procurementReviewStatus === "rejected"
      ) {
        document.procurementReviewBy = currentUser._id;
      }
    }

    // Handle main status ONLY from approver
    if (newStatus) {
      // Only allow status change from "reviewed" to "approved"/"rejected" by approver
      const isApprover =
        document.approvedBy &&
        document.approvedBy.toString() === currentUser._id.toString();

      if (isApprover && document.status === "reviewed") {
        document.status = newStatus;

        // Set approvedBy when status changes to "approved"
        if (newStatus === "approved") {
          document.approvedBy = currentUser._id;
        }

        // Handle rejection by approver
        if (newStatus === "rejected") {
          this._handleRejection(document, previousStatus, currentUser);
        }
      } else {
        // Finance/Procurement reviewers should not change main status
        // So we delete newStatus from data
        delete data.status;
      }
    }

    // Check if either finance or procurement rejected
    const isFinanceRejected = document.financeReviewStatus === "rejected";
    const isProcurementRejected =
      document.procurementReviewStatus === "rejected";

    if (isFinanceRejected || isProcurementRejected) {
      document.status = "rejected";

      // Also update the other review status if one is rejected
      if (isFinanceRejected) {
        document.financeReviewStatus = "rejected";
        document.financeReviewBy = currentUser._id;
      }
      if (isProcurementRejected) {
        document.procurementReviewStatus = "rejected";
        document.procurementReviewBy = currentUser._id;
      }

      return;
    }

    // Check if both finance and procurement approved
    const isFinanceApproved = document.financeReviewStatus === "approved";
    const isProcurementApproved =
      document.procurementReviewStatus === "approved";

    if (isFinanceApproved && isProcurementApproved) {
      // Change to "reviewed" if currently "pending"
      if (document.status === "pending") {
        document.status = "reviewed";
        document.reviewedBy = currentUser._id;
      }
    } else if (isFinanceApproved || isProcurementApproved) {
      // If only one is approved, keep status as "pending"
      document.status = "pending";
    }

    // Update approvedBy if provided when status is "reviewed"
    if (data.approvedBy && document.status === "reviewed") {
      document.approvedBy = data.approvedBy;
    }
  }

  /**
   * Handle generic request status logic (for non-purchase requests)
   * @private
   */
  async _handleGenericRequestStatus({
    document,
    data,
    currentUser,
    newStatus,
  }) {
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

      // Update approvedBy if provided when status is "reviewed"
      if (data.approvedBy && newStatus === "reviewed") {
        document.approvedBy = data.approvedBy;
      }
    }
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

    // Reset finance review status if rejected by finance reviewer
    if (
      document.financeReviewBy &&
      document.financeReviewBy.toString() === currentUser._id.toString()
    ) {
      document.financeReviewStatus = "rejected";
    }

    // Reset procurement review status if rejected by procurement reviewer
    if (
      document.procurementReviewBy &&
      document.procurementReviewBy.toString() === currentUser._id.toString()
    ) {
      document.procurementReviewStatus = "rejected";
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

    // Special notification logic for purchase request two-step approval
    if (requestType === "purchaseRequest") {
      await this._sendPurchaseRequestReviewNotifications({
        document,
        currentUser,
        title,
        creatorId,
        newStatus,
        previousStatus,
      });
    }
  }

  /**
   * Special notification handler for purchase request two-step approval
   * @private
   */
  async _sendPurchaseRequestReviewNotifications({
    document,
    currentUser,
    title,
    creatorId,
    newStatus,
    previousStatus,
  }) {
    // Handle finance review completion
    if (
      document.financeReviewStatus === "approved" &&
      previousStatus !== "rejected"
    ) {
      // Notify creator
      if (creatorId && creatorId.toString() !== currentUser._id.toString()) {
        notify.notifyCreator({
          request: document,
          currentUser,
          requestType: "purchaseRequest",
          title,
          header: "Finance review completed - Awaiting procurement review",
        });
      }

      // Notify procurement reviewer if not completed yet
      if (
        document.procurementReviewBy &&
        document.procurementReviewStatus === "pending"
      ) {
        notify.notifyReviewers({
          request: document,
          currentUser,
          requestType: "purchaseRequest",
          title,
          header: "Purchase request ready for procurement review",
          recipientIds: [document.procurementReviewBy],
        });
      }
    }

    // Handle procurement review completion
    if (
      document.procurementReviewStatus === "approved" &&
      previousStatus !== "rejected"
    ) {
      // Notify creator
      if (creatorId && creatorId.toString() !== currentUser._id.toString()) {
        notify.notifyCreator({
          request: document,
          currentUser,
          requestType: "purchaseRequest",
          title,
          header: "Procurement review completed - Ready for final approval",
        });
      }

      // Notify finance reviewer
      if (document.financeReviewBy) {
        notify.notifyReviewers({
          request: document,
          currentUser,
          requestType: "purchaseRequest",
          title,
          header: "Purchase request ready for final approval",
          recipientIds: [document.financeReviewBy],
        });
      }

      // Notify approver if assigned
      if (document.approvedBy) {
        notify.notifyApprovers({
          request: document,
          currentUser,
          requestType: "purchaseRequest",
          title,
          header: "Purchase request ready for final approval",
        });
      }
    }

    // Notify all parties when both reviews are approved
    if (
      document.financeReviewStatus === "approved" &&
      document.procurementReviewStatus === "approved" &&
      document.status === "reviewed"
    ) {
      const recipientIds = [];
      if (creatorId) recipientIds.push(creatorId);
      if (document.financeReviewBy) recipientIds.push(document.financeReviewBy);
      if (document.procurementReviewBy)
        recipientIds.push(document.procurementReviewBy);

      if (recipientIds.length > 0) {
        notify.notifyReviewers({
          request: document,
          currentUser,
          requestType: "purchaseRequest",
          title,
          header: "All reviews completed - Ready for final approval",
          recipientIds,
        });
      }
    }

    // Handle rejection notifications
    if (newStatus === "rejected") {
      await this._handlePurchaseRequestRejectionNotifications({
        document,
        currentUser,
        title,
        creatorId,
      });
    }
  }

  /**
   * Handle purchase request rejection notifications
   * @private
   */
  async _handlePurchaseRequestRejectionNotifications({
    document,
    currentUser,
    title,
    creatorId,
  }) {
    // Notify creator (if not the one rejecting)
    if (creatorId && creatorId.toString() !== currentUser._id.toString()) {
      notify.notifyCreator({
        request: document,
        currentUser,
        requestType: "purchaseRequest",
        title,
        header: "Your purchase request has been REJECTED",
      });
    }

    // Notify the other reviewer if one rejected
    const recipientIds = [];

    if (
      document.financeReviewStatus === "rejected" &&
      document.procurementReviewBy &&
      document.procurementReviewBy.toString() !== currentUser._id.toString()
    ) {
      recipientIds.push(document.procurementReviewBy);
    }

    if (
      document.procurementReviewStatus === "rejected" &&
      document.financeReviewBy &&
      document.financeReviewBy.toString() !== currentUser._id.toString()
    ) {
      recipientIds.push(document.financeReviewBy);
    }

    if (recipientIds.length > 0) {
      notify.notifyReviewers({
        request: document,
        currentUser,
        requestType: "purchaseRequest",
        title,
        header: "Purchase request has been rejected",
        recipientIds,
      });
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

    // For purchase requests, notify both finance and procurement reviewers
    if (requestType === "purchaseRequest") {
      const recipientIds = [];
      if (document.financeReviewBy) recipientIds.push(document.financeReviewBy);
      if (document.procurementReviewBy)
        recipientIds.push(document.procurementReviewBy);

      if (recipientIds.length > 0) {
        notify.notifyReviewers({
          request: document,
          currentUser,
          requestType,
          title,
          header: "A purchase request you reviewed has been APPROVED",
          recipientIds,
        });
      }
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

    // For purchase requests, notify both finance and procurement reviewers
    if (requestType === "purchaseRequest") {
      const recipientIds = [];
      if (
        document.financeReviewBy &&
        document.financeReviewBy.toString() !== currentUser._id.toString()
      ) {
        recipientIds.push(document.financeReviewBy);
      }
      if (
        document.procurementReviewBy &&
        document.procurementReviewBy.toString() !== currentUser._id.toString()
      ) {
        recipientIds.push(document.procurementReviewBy);
      }

      if (recipientIds.length > 0) {
        notify.notifyReviewers({
          request: document,
          currentUser,
          requestType,
          title,
          header: "A purchase request you reviewed has been REJECTED",
          recipientIds,
        });
      }
    }
  }
}

module.exports = new StatusUpdateService();
