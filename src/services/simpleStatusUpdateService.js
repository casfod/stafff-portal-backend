// services/simpleStatusUpdateService.js
const notify = require("../utils/notify");

class SimpleStatusUpdateService {
  /**
   * Simplified status update handler for single-step approval flows (like SS and PO)
   * @param {Object} options
   * @param {mongoose.Model} options.Model - Mongoose model
   * @param {string} options.id - Document ID
   * @param {Object} options.data - Update data (status, comment)
   * @param {Object} options.currentUser - Current user
   * @param {string} options.requestType - Request type key for notifications
   * @param {string} options.title - Request title for notifications
   * @returns {Promise<Object>} Updated document
   */
  async updateStatus({ Model, id, data, currentUser, requestType, title }) {
    // Find the document
    const document = await Model.findById(id);
    if (!document) {
      throw new Error("Document not found");
    }

    const { status, comment } = data;

    // Validate status
    if (!["pending", "approved", "rejected", "draft"].includes(status)) {
      throw new Error("Invalid status");
    }

    // Add comment if provided
    if (comment && comment.trim()) {
      if (!document.comments) {
        document.comments = [];
      }

      document.comments.unshift({
        user: currentUser._id,
        text: comment.trim(),
        edited: false,
        deleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // Update status
    const previousStatus = document.status;
    document.status = status;

    // Set approvedBy when status changes to "approved"
    if (status === "approved") {
      document.approvedBy = currentUser._id;
    }

    // Clear approvedBy if rejected (optional - depending on your business logic)
    if (status === "rejected") {
      // Keep the approvedBy reference for history
      // No need to clear as it shows who rejected it
    }

    document.updatedAt = new Date();

    // Save the updated document
    const updatedDocument = await document.save();

    // Send notifications for non-draft status changes
    if (status !== "draft") {
      await this._sendNotifications({
        document: updatedDocument,
        previousStatus,
        newStatus: status,
        currentUser,
        requestType,
        title,
      });
    }

    return updatedDocument;
  }

  /**
   * Determine the creator field name for any document type
   * @private
   */
  _getCreatorField(document) {
    // Order matters - check most specific first
    if (document.user) return "user"; // Leave model
    if (document.preparedBy) return "preparedBy"; // Concept Note
    if (document.createdBy) return "createdBy"; // Generic
    if (document.requestedBy) return "requestedBy"; // Generic
    return null;
  }

  /**
   * Get creator ID from document
   * @private
   */
  _getCreatorId(document) {
    const creatorField = this._getCreatorField(document);
    if (!creatorField) return null;

    const creator = document[creatorField];
    if (!creator) return null;

    // Handle populated object vs ID
    return creator._id ? creator._id.toString() : creator.toString();
  }

  /**
   * Send appropriate notifications for simple approval flow
   * @private
   */
  async _sendNotifications({
    document,
    previousStatus,
    newStatus,
    currentUser,
    requestType,
    title,
  }) {
    // Don't notify if status hasn't changed
    if (previousStatus === newStatus) return;

    // Get creator ID using the helper method
    const creatorId = this._getCreatorId(document);
    const currentUserId = currentUser._id.toString();

    switch (newStatus) {
      case "approved":
        // Notify creator (if not the one who approved)
        if (creatorId && creatorId !== currentUserId) {
          await notify.notifyCreator({
            request: document,
            currentUser,
            requestType,
            title,
            header: `Your ${title} has been APPROVED`,
          });
        }

        // Notify anyone who commented (excluding creator and current user)
        if (document.comments && document.comments.length > 0) {
          const uniqueCommenters = [
            ...new Set(document.comments.map((c) => c.user?.toString())),
          ].filter(Boolean);

          const recipientsToNotify = uniqueCommenters.filter(
            (id) => id !== currentUserId && (!creatorId || id !== creatorId)
          );

          if (recipientsToNotify.length > 0) {
            if (typeof notify.notifyMultipleUsers === "function") {
              await notify.notifyMultipleUsers({
                request: document,
                currentUser,
                requestType,
                title,
                header: `A ${title} you commented on has been APPROVED`,
                recipientIds: recipientsToNotify,
              });
            } else {
              for (const recipientId of recipientsToNotify) {
                await notify.notifyCreator({
                  request: document,
                  currentUser,
                  requestType,
                  title,
                  header: `A ${title} you commented on has been APPROVED`,
                  recipientId,
                });
              }
            }
          }
        }
        break;

      case "rejected":
        // Notify creator (if not the one who rejected)
        if (creatorId && creatorId !== currentUserId) {
          await notify.notifyCreator({
            request: document,
            currentUser,
            requestType,
            title,
            header: `Your ${title} has been REJECTED`,
          });
        }

        // Notify anyone who commented (excluding creator and current user)
        if (document.comments && document.comments.length > 0) {
          const uniqueCommenters = [
            ...new Set(document.comments.map((c) => c.user?.toString())),
          ].filter(Boolean);

          const recipientsToNotify = uniqueCommenters.filter(
            (id) => id !== currentUserId && (!creatorId || id !== creatorId)
          );

          if (recipientsToNotify.length > 0) {
            if (typeof notify.notifyMultipleUsers === "function") {
              await notify.notifyMultipleUsers({
                request: document,
                currentUser,
                requestType,
                title,
                header: `A ${title} you commented on has been REJECTED`,
                recipientIds: recipientsToNotify,
              });
            } else {
              for (const recipientId of recipientsToNotify) {
                await notify.notifyCreator({
                  request: document,
                  currentUser,
                  requestType,
                  title,
                  header: `A ${title} you commented on has been REJECTED`,
                  recipientId,
                });
              }
            }
          }
        }
        break;

      case "pending":
        // When moving from draft to pending, notify the approver
        if (
          document.approvedBy &&
          document.approvedBy.toString() !== currentUserId
        ) {
          await notify.notifyApprovers({
            request: document,
            currentUser,
            requestType,
            title,
            header: `New ${title} requires your approval`,
          });
        }
        break;

      default:
        break;
    }
  }
}

module.exports = new SimpleStatusUpdateService();
