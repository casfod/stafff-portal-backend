const {
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
} = require("../services/vendorService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");

const {
  generateVendorsExcelReport,
} = require("../services/vendorExcelService");

const getAllVendors = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;
  const currentUser = await userByToken(req, res);

  const result = await getAllVendorsService(
    { search, sort, page, limit },
    currentUser
  );
  handleResponse(res, 200, "Vendors fetched successfully", result);
});

// Returns only approved vendors — safe to use anywhere vendors are selected
// (purchase orders, contracts, etc.) without leaking draft/pending/rejected records
const getAllApprovedVendors = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;

  const result = await getAllApprovedVendorsService({
    search,
    sort,
    page,
    limit,
  });
  handleResponse(res, 200, "Approved vendors fetched successfully", result);
});

const getVendorById = catchAsync(async (req, res) => {
  const { vendorId } = req.params;
  const vendor = await getVendorByIdService(vendorId);
  handleResponse(res, 200, "Vendor fetched successfully", vendor);
});

const getVendorByCode = catchAsync(async (req, res) => {
  const { vendorCode } = req.params;
  const vendor = await getVendorByCodeService(vendorCode);
  handleResponse(res, 200, "Vendor fetched successfully", { vendor });
});

const createVendor = catchAsync(async (req, res) => {
  const vendorData = req.body;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const vendor = await createVendorService(
    { ...vendorData, createdBy: currentUser._id },
    currentUser,
    files,
    false
  );
  handleResponse(
    res,
    201,
    "Vendor created successfully and submitted for approval",
    { vendor }
  );
});

const createVendorDraft = catchAsync(async (req, res) => {
  const vendorData = req.body;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const vendor = await createVendorService(
    { ...vendorData, createdBy: currentUser._id },
    currentUser,
    files,
    true
  );
  handleResponse(res, 201, "Vendor draft saved successfully", { vendor });
});

const updateVendor = catchAsync(async (req, res) => {
  const { vendorId } = req.params;
  const updateData = req.body;
  const files = req.files || [];

  const vendor = await updateVendorService(vendorId, updateData, files);
  handleResponse(res, 200, "Vendor updated successfully", { vendor });
});

const updateVendorStatus = catchAsync(async (req, res) => {
  const { vendorId } = req.params;
  const { status, comment } = req.body;
  const currentUser = await userByToken(req, res);

  const vendor = await updateVendorStatusService(
    vendorId,
    { status, comment },
    currentUser
  );
  handleResponse(res, 200, `Vendor ${status} successfully`, { vendor });
});

const deleteVendor = catchAsync(async (req, res) => {
  const { vendorId } = req.params;
  const result = await deleteVendorService(vendorId);
  handleResponse(res, 200, result.message);
});

const exportVendorsToExcel = catchAsync(async (req, res) => {
  await generateVendorsExcelReport(res);
});

const getVendorsByStatus = catchAsync(async (req, res) => {
  const { status } = req.params;
  const { search, sort, page, limit } = req.query;

  const result = await getVendorsByStatusService(status, {
    search,
    sort,
    page,
    limit,
  });
  handleResponse(res, 200, "Vendors fetched successfully", result);
});

const getVendorApprovalSummary = catchAsync(async (req, res) => {
  const summary = await getVendorApprovalSummaryService();
  handleResponse(
    res,
    200,
    "Vendor approval summary fetched successfully",
    summary
  );
});

module.exports = {
  getAllVendors,
  getAllApprovedVendors,
  getVendorById,
  exportVendorsToExcel,
  getVendorByCode,
  createVendor,
  createVendorDraft,
  updateVendor,
  updateVendorStatus,
  deleteVendor,
  getVendorsByStatus,
  getVendorApprovalSummary,
};
