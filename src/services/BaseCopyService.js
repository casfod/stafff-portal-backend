// services/baseCopyService.js
const { Types } = require("mongoose");

const NotificationService = require("./notificationService");

class BaseCopyService {
  constructor(model, modelName) {
    this.model = model;
    this.modelName = modelName;
  }

  async validateInput(requestId, userId, recipients) {
    if (!requestId || !userId || !recipients || !Array.isArray(recipients)) {
      throw new Error("Invalid input parameters");
    }
  }
  async verifyOwnership(document, userId) {
    const normalizeId = (id) => {
      if (!id) return null;
      if (typeof id === "string") return id;
      if (Types.ObjectId.isValid(id)) return id.toString();
      return null;
    };

    const userIdStr = normalizeId(userId);
    const createdByStr = normalizeId(document.createdBy);
    const preparedByStr = normalizeId(document.preparedBy);
    const isCreator = (createdByStr || preparedByStr) === userIdStr;

    if (!isCreator) {
      throw new Error("Unauthorized: You are not the creator of this document");
    }
  }

  async addRecipients(requestId, recipients) {
    const updatedDoc = await this.model
      .findByIdAndUpdate(
        requestId,
        { $addToSet: { copiedTo: { $each: recipients } } },
        { new: true, runValidators: true }
      )
      .populate("copiedTo", "email first_name last_name");

    return updatedDoc;
  }

  async sendNotifications(
    userId,
    requestId,
    requestType,
    requestTitle,
    recipients
  ) {
    await NotificationService.sendCopyNotification({
      originalSender: userId,
      requestId,
      requestType,
      requestTitle,
      recipients,
    });
  }

  async copyDocument({
    userId,
    requestId,
    requestType,
    requestTitle,
    recipients,
  }) {
    try {
      await this.validateInput(requestId, userId, recipients);

      const originalDoc = await this.model.findById(requestId);
      if (!originalDoc) {
        throw new Error(`${this.modelName} not found`);
      }

      await this.verifyOwnership(originalDoc, userId);

      const updatedDoc = await this.addRecipients(requestId, recipients);

      // Ensure we're passing the correct parameters
      await this.sendNotifications(
        userId,
        requestId, // Pass the original requestId, not updatedDoc._id
        requestType,
        requestTitle,
        recipients
      );

      return updatedDoc;
    } catch (error) {
      console.error(`Error in ${this.modelName} copyService:`, error);
      throw error;
    }
  }
}

module.exports = BaseCopyService;
