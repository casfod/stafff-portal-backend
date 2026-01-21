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

    // Track which review was just completed
    let completedReviewType = null;
    let completedReviewStatus = null;

    // Handle purchase request specific logic
    if (requestType === "purchaseRequest") {
      const result = await this._handlePurchaseRequestStatus({
        document,
        data,
        currentUser,
        previousStatus,
        newStatus,
      });
      completedReviewType = result.completedReviewType;
      completedReviewStatus = result.completedReviewStatus;
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
      completedReviewType,
      completedReviewStatus,
    });

    return updatedDocument;
  }

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
    const result = {
      completedReviewType: null,
      completedReviewStatus: null,
    };

    const isFinanceReviewer =
      document.financeReviewBy &&
      document.financeReviewBy.toString() === currentUser._id.toString();
    const isProcurementReviewer =
      document.procurementReviewBy &&
      document.procurementReviewBy.toString() === currentUser._id.toString();

    // Handle finance review status
    if (data.financeReviewStatus && isFinanceReviewer) {
      const previousFinanceStatus = document.financeReviewStatus;
      document.financeReviewStatus = data.financeReviewStatus;

      if (
        data.financeReviewStatus === "approved" ||
        data.financeReviewStatus === "rejected"
      ) {
        document.financeReviewBy = currentUser._id;
        result.completedReviewType = "finance";
        result.completedReviewStatus = data.financeReviewStatus;
      }
    }

    // Handle procurement review status
    if (data.procurementReviewStatus && isProcurementReviewer) {
      const previousProcurementStatus = document.procurementReviewStatus;
      document.procurementReviewStatus = data.procurementReviewStatus;

      if (
        data.procurementReviewStatus === "approved" ||
        data.procurementReviewStatus === "rejected"
      ) {
        document.procurementReviewBy = currentUser._id;
        result.completedReviewType = "procurement";
        result.completedReviewStatus = data.procurementReviewStatus;
      }
    }

    // Handle main status ONLY from approver
    if (newStatus) {
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
        delete data.status;
      }
    }

    // Check if either finance or procurement rejected
    const isFinanceRejected = document.financeReviewStatus === "rejected";
    const isProcurementRejected =
      document.procurementReviewStatus === "rejected";

    if (isFinanceRejected || isProcurementRejected) {
      document.status = "rejected";
      return result;
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
    }

    // Update approvedBy if provided when status is "reviewed"
    if (data.approvedBy && document.status === "reviewed") {
      document.approvedBy = data.approvedBy;
    }

    return result;
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
    completedReviewType,
    completedReviewStatus,
  }) {
    // For purchase requests, handle specialized notification flow
    if (requestType === "purchaseRequest") {
      await this._sendPurchaseRequestNotifications({
        document,
        previousStatus,
        newStatus,
        currentUser,
        title,
        creatorId,
        completedReviewType,
        completedReviewStatus,
      });
      return;
    }

    // Original notification logic for non-purchase requests
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
   * Special notification handler for purchase request two-step approval
   * @private
   */
  async _sendPurchaseRequestNotifications({
    document,
    previousStatus,
    newStatus,
    currentUser,
    title,
    creatorId,
    completedReviewType,
    completedReviewStatus,
  }) {
    // Handle review completion notifications
    if (completedReviewType && completedReviewStatus) {
      if (completedReviewStatus === "rejected") {
        // Request was rejected by a reviewer
        await notify.notifyReviewRejection({
          request: document,
          currentUser,
          requestType: "purchaseRequest",
          title,
          rejectingReviewType: completedReviewType,
        });
      } else if (completedReviewStatus === "approved") {
        // One review was approved
        const otherReviewStatus =
          completedReviewType === "finance"
            ? document.procurementReviewStatus
            : document.financeReviewStatus;

        if (otherReviewStatus === "pending") {
          // First review approved, awaiting second review
          await notify.notifyAwaitingSecondReview({
            request: document,
            currentUser,
            requestType: "purchaseRequest",
            title,
            completedReviewType,
            completedReviewStatus,
          });
        } else if (otherReviewStatus === "approved") {
          // Both reviews approved
          await notify.notifyReadyForFinalApproval({
            request: document,
            currentUser,
            requestType: "purchaseRequest",
            title,
          });
        }
      }
    }

    // Handle final approval/rejection by approver
    if (newStatus && (newStatus === "approved" || newStatus === "rejected")) {
      // Notify all parties about final decision
      const recipientIds = [];
      if (creatorId) recipientIds.push(creatorId);
      if (document.financeReviewBy) recipientIds.push(document.financeReviewBy);
      if (document.procurementReviewBy)
        recipientIds.push(document.procurementReviewBy);

      if (recipientIds.length > 0) {
        await notify.notifyPurchaseRequestUsers({
          request: document,
          currentUser,
          requestType: "purchaseRequest",
          title,
          header: `Purchase request has been ${newStatus.toUpperCase()}`,
          recipientIds,
        });
      }
    }

    // Handle status change to "reviewed" (both reviews completed)
    if (newStatus === "reviewed" && previousStatus === "pending") {
      // Notify approver if assigned
      if (document.approvedBy) {
        await notify.notifyApprovers({
          request: document,
          currentUser,
          requestType: "purchaseRequest",
          title,
          header:
            "Finance and procurement reviews completed - Awaiting final decision",
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
