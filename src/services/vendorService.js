const Vendor = require("../models/VendorModel");
const {
  generateVendorCode,
  formatPhoneNumber,
} = require("../utils/vendorCodeGenerator");
const AppError = require("../utils/appError");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const buildQuery = require("../utils/buildQuery");
const handleFileUploads = require("../utils/FileUploads");
const fileService = require("./fileService");
const notify = require("../utils/notify");
const searchConfig = require("../utils/searchConfig");

const getAllVendorsService = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;

  // Define the fields you want to search in
  const searchFields = searchConfig.vendor;

  // Build the search query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  // Common conditions for all users
  const commonConditions = [
    { createdBy: currentUser._id }, // Always see own requests
    { copiedTo: currentUser._id }, // Always see requests copied to you
  ];

  // Role-specific conditions
  let roleSpecificConditions = [];

  switch (currentUser.role) {
    case "STAFF":
      // Staff only get common conditions (no additional access)
      break;

    case "ADMIN":
      roleSpecificConditions.push({ approvedBy: currentUser._id });
      break;

    case "SUPER-ADMIN":
      roleSpecificConditions.push(
        // { status: { $ne: "draft" } }, // All non-draft requests
        {
          $and: [
            { createdBy: currentUser._id },
            { status: "draft" }, // Only their own drafts
          ],
        }
      );
      break;

    default:
      throw new Error("Invalid user role");
  }

  // Combine all conditions
  query.$or = [...commonConditions, ...roleSpecificConditions];

  // Build the sort object
  const sortQuery = buildSortQuery(sort);

  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role id _id" },
    { path: "approvedBy", select: "email first_name last_name role id _id" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  // Filters, sorting, pagination, and populate
  const {
    results: vendors,

    total,
    totalPages,
    currentPage,
  } = await paginate(
    Vendor,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  // Fetch vendors with filters, sorting, and pagination
  // const {
  //   results: vendors,
  //   total,
  //   totalPages,
  //   currentPage,
  // } = await paginate(Vendor, query, { page, limit }, sortQuery);

  const vendorsWithFiles = await Promise.all(
    vendors.map(async (vendor) => {
      const files = await fileService.getFilesByDocument("Vendors", vendor._id);
      return {
        ...vendor.toJSON(),
        files,
      };
    })
  );

  return {
    vendors: vendorsWithFiles,
    totalVendors: total,
    totalPages,
    currentPage,
  };
};

const getVendorByIdService = async (vendorId) => {
  const vendor = await Vendor.findById(vendorId)
    .populate("createdBy", "first_name last_name email role")
    .populate("approvedBy", "first_name last_name email role")
    .populate("comments.user", "first_name last_name email role");

  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }

  const files = await fileService.getFilesByDocument("Vendors", vendorId);

  return {
    ...vendor.toJSON(),
    files,
  };
};

const getVendorByCodeService = async (vendorCode) => {
  const vendor = await Vendor.findOne({ vendorCode: vendorCode.toUpperCase() })
    .populate("createdBy", "first_name last_name email role")
    .populate("approvedBy", "first_name last_name email role")
    .populate("comments.user", "first_name last_name email role");

  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }
  return vendor;
};

const createVendorService = async (
  vendorData,
  currentUser,
  files = [],
  isDraft = false
) => {
  // Check if vendor with same email already exists
  const existingVendorByEmail = await Vendor.findOne({
    email: vendorData.email,
  });
  if (existingVendorByEmail) {
    throw new AppError("Vendor with this email already exists", 400);
  }

  // Check if vendor with same business name already exists
  const existingVendorByBusiness = await Vendor.findOne({
    businessName: vendorData.businessName,
  });
  if (existingVendorByBusiness) {
    throw new AppError("Vendor with this business name already exists", 400);
  }

  // Format phone numbers
  vendorData.businessPhoneNumber = formatPhoneNumber(
    vendorData.businessPhoneNumber
  );
  vendorData.contactPhoneNumber = formatPhoneNumber(
    vendorData.contactPhoneNumber
  );

  // Generate unique vendor code
  vendorData.vendorCode = await generateVendorCode(vendorData.businessName);

  let vendor;

  if (isDraft) {
    // Save as draft
    vendor = await Vendor.create({
      ...vendorData,
      status: "draft",
      createdBy: currentUser._id,
      approvedBy: null,
    });
  } else {
    // Save and submit for approval
    vendor = await Vendor.create({
      ...vendorData,
      status: "pending",
      createdBy: currentUser._id,
    });

    // Notify approver
    if (vendorData.approvedBy) {
      await notify.notifyApprovers({
        request: vendor,
        currentUser,
        requestType: "vendorManagement",
        title: "Vendor Management",
        header: "New vendor registration needs your approval",
      });
    }
  }

  // Handle file uploads
  if (files && files.length > 0) {
    await handleFileUploads({
      files,
      requestId: vendor._id,
      modelTable: "Vendors",
    });
  }

  return vendor;
};

const updateVendorService = async (vendorId, updateData, files = []) => {
  // Check if vendor exists
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }

  // Don't allow updating approved vendors
  if (vendor.status === "approved") {
    throw new AppError("Cannot update approved vendors", 400);
  }

  if (files && files.length > 0) {
    await fileService.deleteFilesByDocument("Vendors", vendorId);

    await handleFileUploads({
      files,
      requestId: vendorId,
      modelTable: "Vendors",
    });
  }

  // If email is being updated, check for duplicates
  if (updateData.email && updateData.email !== vendor.email) {
    const existingVendor = await Vendor.findOne({ email: updateData.email });
    if (existingVendor) {
      throw new AppError("Vendor with this email already exists", 400);
    }
  }

  // If business name is being updated, check for duplicates and regenerate vendor code
  if (
    updateData.businessName &&
    updateData.businessName !== vendor.businessName
  ) {
    const existingBusiness = await Vendor.findOne({
      businessName: updateData.businessName,
    });
    if (existingBusiness) {
      throw new AppError("Vendor with this business name already exists", 400);
    }
    // Regenerate vendor code if business name changes
    updateData.vendorCode = await generateVendorCode(updateData.businessName);
  }

  // Format phone numbers if provided
  if (updateData.businessPhoneNumber) {
    updateData.businessPhoneNumber = formatPhoneNumber(
      updateData.businessPhoneNumber
    );
  }
  if (updateData.contactPhoneNumber) {
    updateData.contactPhoneNumber = formatPhoneNumber(
      updateData.contactPhoneNumber
    );
  }

  const updatedVendor = await Vendor.findByIdAndUpdate(
    vendorId,
    { ...updateData, updatedAt: Date.now() },
    { new: true, runValidators: true }
  );

  return updatedVendor;
};

const updateVendorStatusService = async (vendorId, data, currentUser) => {
  const { status, comment } = data;

  // Find the vendor
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }

  // Add comment if provided
  if (comment && comment.trim()) {
    if (!vendor.comments) {
      vendor.comments = [];
    }

    vendor.comments.unshift({
      user: currentUser._id,
      text: comment.trim(),
    });
  }

  // Update status
  const previousStatus = vendor.status;
  vendor.status = status;

  // Set approvedBy when status changes to "approved"
  if (status === "approved") {
    vendor.approvedBy = currentUser._id;
  }

  vendor.updatedAt = new Date();

  // Save the updated vendor
  const updatedVendor = await vendor.save();

  // Send notifications
  await sendVendorStatusNotifications({
    vendor: updatedVendor,
    previousStatus,
    newStatus: status,
    currentUser,
  });

  return updatedVendor;
};

const sendVendorStatusNotifications = async ({
  vendor,
  previousStatus,
  newStatus,
  currentUser,
}) => {
  // Don't notify if status hasn't changed
  if (previousStatus === newStatus) return;

  const creatorId = vendor.createdBy;

  switch (newStatus) {
    case "approved":
      // Notify creator
      if (creatorId && creatorId.toString() !== currentUser._id.toString()) {
        await notify.notifyCreator({
          request: vendor,
          currentUser,
          requestType: "vendorManagement",
          title: "Vendor Management",
          header: "Your vendor registration has been APPROVED",
        });
      }

      // Notify anyone who commented
      if (vendor.comments && vendor.comments.length > 0) {
        const uniqueCommenters = [
          ...new Set(vendor.comments.map((c) => c.user?.toString())),
        ].filter(Boolean);
        const recipientsToNotify = uniqueCommenters.filter(
          (id) =>
            id !== currentUser._id.toString() &&
            (!creatorId || id !== creatorId.toString())
        );

        if (recipientsToNotify.length > 0) {
          for (const recipientId of recipientsToNotify) {
            await notify.notifyCreator({
              request: vendor,
              currentUser,
              requestType: "vendorManagement",
              title: "Vendor Management",
              header: "A vendor you commented on has been APPROVED",
              recipientId,
            });
          }
        }
      }
      break;

    case "rejected":
      // Notify creator
      if (creatorId && creatorId.toString() !== currentUser._id.toString()) {
        await notify.notifyCreator({
          request: vendor,
          currentUser,
          requestType: "vendorManagement",
          title: "Vendor Management",
          header: "Your vendor registration has been REJECTED",
        });
      }

      // Notify anyone who commented
      if (vendor.comments && vendor.comments.length > 0) {
        const uniqueCommenters = [
          ...new Set(vendor.comments.map((c) => c.user?.toString())),
        ].filter(Boolean);
        const recipientsToNotify = uniqueCommenters.filter(
          (id) =>
            id !== currentUser._id.toString() &&
            (!creatorId || id !== creatorId.toString())
        );

        if (recipientsToNotify.length > 0) {
          for (const recipientId of recipientsToNotify) {
            await notify.notifyCreator({
              request: vendor,
              currentUser,
              requestType: "vendorManagement",
              title: "Vendor Management",
              header: "A vendor you commented on has been REJECTED",
              recipientId,
            });
          }
        }
      }
      break;

    default:
      break;
  }
};

const deleteVendorService = async (vendorId) => {
  await fileService.deleteFilesByDocument("Vendors", vendorId);

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }

  await Vendor.findByIdAndDelete(vendorId);
  return { message: "Vendor deleted successfully" };
};

const getVendorsByStatusService = async (status, queryParams = {}) => {
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
      .populate("approvedBy", "first_name last_name email role")
      .populate("comments.user", "first_name last_name email role"),
    Vendor.countDocuments(filter),
  ]);

  const vendorsWithFiles = await Promise.all(
    vendors.map(async (vendor) => {
      const files = await fileService.getFilesByDocument("Vendors", vendor._id);
      return {
        ...vendor.toJSON(),
        files,
      };
    })
  );

  return {
    vendors: vendorsWithFiles,
    total,
    totalPages: Math.ceil(total / limitNum),
    currentPage: parseInt(page),
  };
};

const getVendorApprovalSummaryService = async () => {
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
};

module.exports = {
  getAllVendorsService,
  getVendorByIdService,
  getVendorByCodeService,
  createVendorService,
  updateVendorService,
  updateVendorStatusService,
  deleteVendorService,
  getVendorsByStatusService,
  getVendorApprovalSummaryService,
};
