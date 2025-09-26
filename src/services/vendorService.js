const Vendor = require("../models/VendorModel");
// const {
//   buildQuery,
//   buildSortQuery,
//   paginate,
// } = require("../utils/queryBuilder");
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

const getAllVendorsService = async (queryParams) => {
  const { search, sort, page = 1, limit = 10 } = queryParams;

  // Define the fields you want to search in
  const searchFields = [
    "businessName",
    "businessType",
    "email",
    "contactPerson",
    "category",
    "vendorCode",
  ];

  // Build the query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  const query = buildQuery(searchTerms, searchFields);

  // Build the sort object
  const sortQuery = buildSortQuery(sort);

  // Fetch vendors with filters, sorting, and pagination
  const {
    results: vendors,
    total,
    totalPages,
    currentPage,
  } = await paginate(Vendor, query, { page, limit }, sortQuery);

  const vendorsWithFiles = await Promise.all(
    vendors.map(async (project) => {
      const files = await fileService.getFilesByDocument(
        "Vendors",
        project._id
      );
      return {
        ...project.toJSON(),
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
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }
  const files = await fileService.getFilesByDocument("Vendors", vendorId);

  return {
    ...vendor,
    files,
  };
};

const getVendorByCodeService = async (vendorCode) => {
  const vendor = await Vendor.findOne({ vendorCode: vendorCode.toUpperCase() });
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }
  return vendor;
};

const createVendorService = async (vendorData, files = []) => {
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

  const vendor = await Vendor.create(vendorData);

  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: vendor._id,
      modelTable: "Vendors",
    });
  }

  return vendor;
};

const updateVendorService = async (vendorId, updateData, files = []) => {
  console.log("/////😀😀😀😀//////", vendorId, updateData, files);
  if (files.length > 0) {
    await fileService.deleteFilesByDocument("Vendors", vendorId);

    await handleFileUploads({
      files,
      requestId: vendorId,
      modelTable: "Vendors",
    });
  }

  // Check if vendor exists
  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
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

const deleteVendorService = async (vendorId) => {
  await fileService.deleteFilesByDocument("Vendors", vendorId);

  const vendor = await Vendor.findById(vendorId);
  if (!vendor) {
    throw new AppError("Vendor not found", 404);
  }

  await Vendor.findByIdAndDelete(vendorId);
  return { message: "Vendor deleted successfully" };
};

module.exports = {
  getAllVendorsService,
  getVendorByIdService,
  getVendorByCodeService,
  createVendorService,
  updateVendorService,
  deleteVendorService,
};
