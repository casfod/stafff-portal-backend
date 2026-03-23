// services/vendorStatusService.js
const Vendor = require("../models/VendorModel");
const SimpleStatusUpdateService = require("./simpleStatusUpdateService");
const AppError = require("../utils/appError");
const notify = require("../utils/notify");

class VendorStatusService {
  /**
   * Save vendor as draft
   */
  async saveAsDraft(vendorData, currentUser) {
    const vendor = new Vendor({
      ...vendorData,
      status: "draft",
      createdBy: currentUser._id,
    });
    await vendor.save();
    return vendor;
  }

  /**
   * Submit vendor for approval (draft -> pending)
   */
  async submitForApproval(vendorId, currentUser, approvedById) {
    const vendor = await Vendor.findById(vendorId);

    if (!vendor) {
      throw new AppError("Vendor not found", 404);
    }

    if (vendor.status !== "draft") {
      throw new AppError(
        `Cannot submit vendor with status: ${vendor.status}`,
        400
      );
    }

    // Update to pending and set approver
    vendor.status = "pending";
    if (approvedById) {
      vendor.approvedBy = approvedById;
    }
    vendor.updatedAt = new Date();

    await vendor.save();

    // Notify approver
    if (vendor.approvedBy) {
      await notify.notifyApprovers({
        request: vendor,
        currentUser,
        requestType: "vendorManagement",
        title: "Vendor Management",
        header: "New vendor registration needs your approval",
      });
    }

    return vendor;
  }

  /**
   * Update vendor status (approve/reject) using SimpleStatusUpdateService
   */
  async updateVendorStatus(vendorId, data, currentUser) {
    const { status, comment } = data;

    // Validate status
    if (!["approved", "rejected", "pending"].includes(status)) {
      throw new AppError(
        "Invalid status. Allowed values: approved, rejected, pending",
        400
      );
    }

    // Find the vendor
    const vendor = await Vendor.findById(vendorId);
    if (!vendor) {
      throw new AppError("Vendor not found", 404);
    }

    // Check if vendor is in pending state for approval actions
    if (status === "approved" || status === "rejected") {
      if (vendor.status !== "pending") {
        throw new AppError(
          `Cannot ${status} vendor with status: ${vendor.status}. Only pending vendors can be approved/rejected.`,
          400
        );
      }

      // Use SimpleStatusUpdateService for status update
      const updatedVendor = await SimpleStatusUpdateService.updateStatus({
        Model: Vendor,
        id: vendorId,
        data: { status, comment },
        currentUser,
        requestType: "vendorManagement",
        title: "Vendor Management",
      });

      return updatedVendor;
    }

    // For reverting to pending (if needed)
    if (status === "pending") {
      vendor.status = "pending";
      vendor.approvedBy = null;
      vendor.updatedAt = new Date();

      // Add comment if provided
      if (comment && comment.trim()) {
        if (!vendor.comments) vendor.comments = [];
        vendor.comments.unshift({
          user: currentUser._id,
          text: comment.trim(),
        });
      }

      await vendor.save();

      // Notify approver
      if (vendor.approvedBy) {
        await notify.notifyApprovers({
          request: vendor,
          currentUser,
          requestType: "vendorManagement",
          title: "Vendor Management",
          header: "Vendor registration resubmitted for approval",
        });
      }

      return vendor;
    }

    return vendor;
  }

  /**
   * Get all vendors with filters for approval workflow
   */
  async getVendorsByStatus(status, queryParams = {}) {
    const { search, sort, page = 1, limit = 10 } = queryParams;

    const filter = status ? { status } : {};

    // Add search functionality if needed
    if (search) {
      filter.$or = [
        { businessName: { $regex: search, $options: "i" } },
        { vendorCode: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { contactPerson: { $regex: search, $options: "i" } },
      ];
    }

    // Build sort query
    let sortQuery = { createdAt: -1 };
    if (sort) {
      const [field, order] = sort.split(":");
      sortQuery = { [field]: order === "desc" ? -1 : 1 };
    }

    const skip = (page - 1) * limit;
    const limitNum = parseInt(limit);

    const [vendors, total] = await Promise.all([
      Vendor.find(filter)
        .sort(sortQuery)
        .skip(skip)
        .limit(limitNum)
        .populate("createdBy", "first_name last_name email role")
        .populate("approvedBy", "first_name last_name email role"),
      Vendor.countDocuments(filter),
    ]);

    return {
      vendors,
      total,
      totalPages: Math.ceil(total / limitNum),
      currentPage: parseInt(page),
    };
  }

  /**
   * Get vendor approval summary (for dashboard)
   */
  async getVendorApprovalSummary() {
    const [draftCount, pendingCount, approvedCount, rejectedCount] =
      await Promise.all([
        Vendor.countDocuments({ status: "draft" }),
        Vendor.countDocuments({ status: "pending" }),
        Vendor.countDocuments({ status: "approved" }),
        Vendor.countDocuments({ status: "rejected" }),
      ]);

    return {
      draft: draftCount,
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
      total: draftCount + pendingCount + approvedCount + rejectedCount,
    };
  }
}

module.exports = new VendorStatusService();
