const {
  getAllVendorsService,
  getVendorByIdService,
  getVendorByCodeService,
  createVendorService,
  updateVendorService,
  deleteVendorService,
} = require("../services/vendorService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");

const getAllVendors = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;
  const result = await getAllVendorsService({ search, sort, page, limit });
  handleResponse(res, 200, "Vendors fetched successfully", result);
});

const getVendorById = catchAsync(async (req, res) => {
  const { vendorId } = req.params;
  const vendor = await getVendorByIdService(vendorId);
  handleResponse(res, 200, "Vendor fetched successfully", { vendor });
});

const getVendorByCode = catchAsync(async (req, res) => {
  const { vendorCode } = req.params;
  const vendor = await getVendorByCodeService(vendorCode);
  handleResponse(res, 200, "Vendor fetched successfully", { vendor });
});

const createVendor = catchAsync(async (req, res) => {
  const vendorData = req.body;
  const files = req.files || [];

  const vendor = await createVendorService(vendorData, files);
  handleResponse(res, 201, "Vendor created successfully", { vendor });
});

const updateVendor = catchAsync(async (req, res) => {
  const { vendorId } = req.params;
  const updateData = req.body;

  const files = req.files || [];
  const vendor = await updateVendorService(vendorId, updateData, files);
  handleResponse(res, 200, "Vendor updated successfully", { vendor });
});

const deleteVendor = catchAsync(async (req, res) => {
  const { vendorId } = req.params;
  const result = await deleteVendorService(vendorId);
  handleResponse(res, 200, result.message);
});

module.exports = {
  getAllVendors,
  getVendorById,
  getVendorByCode,
  createVendor,
  updateVendor,
  deleteVendor,
};
