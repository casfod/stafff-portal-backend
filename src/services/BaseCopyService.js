// services/baseCopyService.js
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
    if (!document.createdBy.equals(userId)) {
      throw new Error("Unauthorized to copy this document");
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

  async sendNotifications(document, userId, recipients) {
    await NotificationService.sendCopyNotification({
      documentId: document._id,
      documentType: this.modelName,
      originalRequester: userId,
      recipients,
      documentTitle:
        document.activityDescription || document.title || this.modelName,
    });
  }

  async copyDocument(requestId, userId, recipients) {
    try {
      await this.validateInput(requestId, userId, recipients);

      const originalDoc = await this.model.findById(requestId);
      if (!originalDoc) {
        throw new Error(`${this.modelName} not found`);
      }

      await this.verifyOwnership(originalDoc, userId);

      const updatedDoc = await this.addRecipients(requestId, recipients);
      await this.sendNotifications(updatedDoc, userId, recipients);

      return updatedDoc;
    } catch (error) {
      console.error(`Error in ${this.modelName} copyService:`, error);
      throw error;
    }
  }
}

module.exports = BaseCopyService;
