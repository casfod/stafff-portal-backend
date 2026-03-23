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

  const searchFields = searchConfig.vendor;
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  // Common conditions for all users
  const commonConditions = [
    { createdBy: currentUser._id }, // Always see own requests
    { copiedTo: currentUser._id }, // Always see requests copied to you
  ];

  let roleSpecificConditions = [];

  switch (currentUser.role) {
    case "STAFF":
      // Staff only get common conditions
      break;

    case "ADMIN":
      roleSpecificConditions.push({ approvedBy: currentUser._id });
      break;

    case "SUPER-ADMIN":
      // TEMPORARY: See all vendors including all drafts during vendor verification phase.
      // TODO: Once all vendors are verified and approved, revert to:
      //   { status: { $ne: "draft" } }  — all non-drafts
      //   { createdBy: currentUser._id, status: "draft" }  — only own drafts
      roleSpecificConditions.push({ status: { $exists: true } }); // matches everything
      break;

    default:
      throw new Error("Invalid user role");
  }

  query.$or = [...commonConditions, ...roleSpecificConditions];

  const sortQuery = buildSortQuery(sort);

  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role id _id" },
    { path: "approvedBy", select: "email first_name last_name role id _id" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

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

// Separate service for approved vendors only — used by other modules
// (procurement, finance, etc.) that should only ever see approved vendors
const getAllApprovedVendorsService = async (queryParams) => {
  const { search, sort, page = 1, limit = 10 } = queryParams;

  const filter = { status: "approved" };

  if (search) {
    filter.$or = [
      { businessName: { $regex: search, $options: "i" } },
      { vendorCode: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { contactPerson: { $regex: search, $options: "i" } },
    ];
  }

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
    totalPages: Math.ceil(total / limitNum),
    currentPage: parseInt(page),
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
  const existingVendorByEmail = await Vendor.findOne({
    email: vendorData.email,
  });
  if (existingVendorByEmail) {
    throw new AppError("Vendor with this email already exists", 400);
  }

  const existingVendorByBusiness = await Vendor.findOne({
    businessName: vendorData.businessName,
  });
  if (existingVendorByBusiness) {
    throw new AppError("Vendor with this business name already exists", 400);
  }

  vendorData.businessPhoneNumber = formatPhoneNumber(
    vendorData.businessPhoneNumber
  );
  vendorData.contactPhoneNumber = formatPhoneNumber(
    vendorData.contactPhoneNumber
  );

  vendorData.vendorCode = await generateVendorCode(vendorData.businessName);

  let vendor;

  if (isDraft) {
    vendor = await Vendor.create({
      ...vendorData,
      status: "draft",
      createdBy: currentUser._id,
      approvedBy: null,
    });
  } else {
    vendor = await Vendor.create({
      ...vendorData,
      status: "pending",
      createdBy: currentUser._id,
    });

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
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }

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

  if (updateData.email && updateData.email !== vendor.email) {
    const existingVendor = await Vendor.findOne({ email: updateData.email });
    if (existingVendor) {
      throw new AppError("Vendor with this email already exists", 400);
    }
  }

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
    updateData.vendorCode = await generateVendorCode(updateData.businessName);
  }

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

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }

  if (comment && comment.trim()) {
    if (!vendor.comments) {
      vendor.comments = [];
    }

    vendor.comments.unshift({
      user: currentUser._id,
      text: comment.trim(),
    });
  }

  const previousStatus = vendor.status;
  vendor.status = status;

  if (status === "approved") {
    vendor.approvedBy = currentUser._id;
  }

  vendor.updatedAt = new Date();

  const updatedVendor = await vendor.save();

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
  if (previousStatus === newStatus) return;

  const creatorId = vendor.createdBy;

  switch (newStatus) {
    case "approved":
      if (creatorId && creatorId.toString() !== currentUser._id.toString()) {
        await notify.notifyCreator({
          request: vendor,
          currentUser,
          requestType: "vendorManagement",
          title: "Vendor Management",
          header: "Your vendor registration has been APPROVED",
        });
      }

      if (vendor.comments && vendor.comments.length > 0) {
        const uniqueCommenters = [
          ...new Set(vendor.comments.map((c) => c.user?.toString())),
        ].filter(Boolean);
        const recipientsToNotify = uniqueCommenters.filter(
          (id) =>
            id !== currentUser._id.toString() &&
            (!creatorId || id !== creatorId.toString())
        );

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
      break;

    case "rejected":
      if (creatorId && creatorId.toString() !== currentUser._id.toString()) {
        await notify.notifyCreator({
          request: vendor,
          currentUser,
          requestType: "vendorManagement",
          title: "Vendor Management",
          header: "Your vendor registration has been REJECTED",
        });
      }

      if (vendor.comments && vendor.comments.length > 0) {
        const uniqueCommenters = [
          ...new Set(vendor.comments.map((c) => c.user?.toString())),
        ].filter(Boolean);
        const recipientsToNotify = uniqueCommenters.filter(
          (id) =>
            id !== currentUser._id.toString() &&
            (!creatorId || id !== creatorId.toString())
        );

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

  if (search) {
    filter.$or = [
      { businessName: { $regex: search, $options: "i" } },
      { vendorCode: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { contactPerson: { $regex: search, $options: "i" } },
    ];
  }

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
  getAllApprovedVendorsService,
  getVendorByIdService,
  getVendorByCodeService,
  createVendorService,
  updateVendorService,
  updateVendorStatusService,
  deleteVendorService,
  getVendorsByStatusService,
  getVendorApprovalSummaryService,
};
