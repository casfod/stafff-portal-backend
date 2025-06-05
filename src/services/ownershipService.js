// services/ownershipService.js
const { Types } = require("mongoose");

class OwnershipService {
  static verify(document, userId, options = {}) {
    const userIdObj =
      typeof userId === "string" ? new Types.ObjectId(userId) : userId;

    // Required check - always verify creator
    if (!document.createdBy || !document.createdBy.equals(userIdObj)) {
      throw new Error("Unauthorized: Document creator mismatch");
    }

    // Optional preparedBy check
    if (options.requirePreparedBy) {
      if (!document.preparedBy) {
        throw new Error(
          "Document preparation verification required but missing preparedBy"
        );
      }
      if (!document.preparedBy.equals(userIdObj)) {
        throw new Error("Unauthorized: Document preparer mismatch");
      }
    }

    return true;
  }
}

module.exports = OwnershipService;
