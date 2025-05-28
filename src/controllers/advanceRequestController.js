const {
  saveAdvanceRequest,
  saveAndSendAdvanceRequest,
  getAdvanceRequests,
  getAdvanceRequestById,
  updateAdvanceRequest,
  updateRequestStatus,
  deleteAdvanceRequest,
  getAdvanceRequestStats,
} = require("../services/advanceRequestService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const parseJsonField = require("../utils/parseJsonField");
const userByToken = require("../utils/userByToken");

const copyRequest = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { recipients } = req.body;
  const currentUser = await userByToken(req, res);

  const updatedRequest = await AdvanceRequestCopyService.copyDocument(
    id,
    currentUser._id,
    recipients
  );

  handleResponse(
    res,
    200,
    "Advance request copied successfully",
    updatedRequest
  );
});

const save = catchAsync(async (req, res) => {
  const data = req.body;
  const currentUser = await userByToken(req, res);

  const advanceRequest = await saveAdvanceRequest(data, currentUser);

  handleResponse(
    res,
    201,
    "Advance request saved successfully",
    advanceRequest
  );
});

// Save and send a advance request (pending)
const saveAndSend = catchAsync(async (req, res) => {
  req.body.periodOfActivity = parseJsonField(
    req.body,
    "periodOfActivity",
    true
  );
  req.body.itemGroups = parseJsonField(req.body, "itemGroups", true);

  const data = req.body;
  const files = req.files || [];

  const currentUser = await userByToken(req, res);

  const advanceRequest = await saveAndSendAdvanceRequest(
    data,
    currentUser,
    files
  );

  handleResponse(
    res,
    201,
    "Advance request saved and sent successfully",
    advanceRequest
  );
});

//Get stats
const getStats = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  const stats = await getAdvanceRequestStats(currentUser);

  handleResponse(
    res,
    200,
    "Advance requests stats fetched successfully",
    stats
  );
});

// Get all advance requests
const getAll = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;
  const currentUser = await userByToken(req, res);

  const advanceRequests = await getAdvanceRequests(
    { search, sort, page, limit },
    currentUser
  );

  handleResponse(
    res,
    200,
    "All advance requests fetched successfully",
    advanceRequests
  );
});

// Get a single advance request by ID
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const advanceRequest = await getAdvanceRequestById(id);
  if (!advanceRequest) {
    return handleResponse(res, 404, "Advance request not found");
  }

  handleResponse(
    res,
    200,
    "Advance request fetched successfully",
    advanceRequest
  );
});

// Update a advance request
const update = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { id } = req.params;
  const data = req.body;
  const files = req.files || [];

  const advanceRequest = await updateAdvanceRequest(
    id,
    data,
    files,
    currentUser
  );
  if (!advanceRequest) {
    return handleResponse(res, 404, "Advance request not found");
  }

  handleResponse(
    res,
    200,
    "Advance request updated successfully",
    advanceRequest
  );
});

const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  // Fetch the current user
  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const updatedRequest = await updateRequestStatus(id, data, currentUser);

  handleResponse(res, 200, "Request status updated", updatedRequest);
});

// Delete a advance request
const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const advanceRequest = await deleteAdvanceRequest(id);
  if (!advanceRequest) {
    return handleResponse(res, 404, "Advance request not found");
  }

  handleResponse(
    res,
    200,
    "Advance request deleted successfully",
    advanceRequest
  );
});

module.exports = {
  copyRequest,
  save,
  saveAndSend,
  getAll,
  getStats,
  getById,
  update,
  updateStatus,
  remove,
};
