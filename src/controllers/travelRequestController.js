const {
  saveTravelRequest,
  saveAndSendTravelRequest,
  getTravelRequests,
  getTravelRequestById,
  updateTravelRequest,
  updateRequestStatus,
  deleteTravelRequest,
  getTravelRequestStats,
  TravelRequestCopyService,
} = require("../services/travelRequestService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const parseJsonField = require("../utils/parseJsonField");
const userByToken = require("../utils/userByToken");

const copyRequest = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body;
  const currentUser = await userByToken(req, res);

  if (!userIds || !Array.isArray(userIds)) {
    throw new appError("Please provide valid recipient user IDs", 400);
  }

  const travelRequest = await getTravelRequestById(id);
  if (!travelRequest) {
    throw new appError("Request not found", 404);
  }

  const updatedRequest = await TravelRequestCopyService.copyDocument({
    userId: currentUser._id,
    requestId: id,
    requestType: "travelRequest",
    requestTitle: "Travel Request",
    recipients: userIds,
  });

  handleResponse(res, 200, "Request copied successfully", updatedRequest);
});

const save = catchAsync(async (req, res) => {
  const data = req.body;
  const currentUser = await userByToken(req, res);

  const travelRequest = await saveTravelRequest(data, currentUser);

  handleResponse(res, 201, "Travel request saved successfully", travelRequest);
});

// Save and send a travel request (pending)
const saveAndSend = catchAsync(async (req, res) => {
  req.body.travelRequest = parseJsonField(req.body, "travelRequest", true);
  req.body.expenses = parseJsonField(req.body, "expenses", true);

  const data = req.body;
  const files = req.files || [];

  const currentUser = await userByToken(req, res);

  const travelRequest = await saveAndSendTravelRequest(
    data,
    currentUser,
    files
  );

  handleResponse(
    res,
    201,
    "Travel request saved and sent successfully",
    travelRequest
  );
});

//Get stats
const getStats = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  const stats = await getTravelRequestStats(currentUser);

  handleResponse(res, 200, "Travel requests stats fetched successfully", stats);
});

// Get all travel requests
const getAll = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;
  const currentUser = await userByToken(req, res);

  const travelRequests = await getTravelRequests(
    { search, sort, page, limit },
    currentUser
  );

  handleResponse(
    res,
    200,
    "All Travel requests fetched successfully",
    travelRequests
  );
});

// Get a single Travel request by ID
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const travelRequest = await getTravelRequestById(id);
  if (!travelRequest) {
    return handleResponse(res, 404, "Travel request not found");
  }

  handleResponse(
    res,
    200,
    "Travel request fetched successfully",
    travelRequest
  );
});

// Update a Travel request
const update = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { id } = req.params;
  const data = req.body;
  const files = req.files || [];

  const travelRequest = await updateTravelRequest(id, data, files, currentUser);

  if (!travelRequest) {
    return handleResponse(res, 404, "Travel request not found");
  }

  handleResponse(
    res,
    200,
    "Travel request updated successfully",
    travelRequest
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

// Delete a Travel request
const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const travelRequest = await deleteTravelRequest(id);
  if (!travelRequest) {
    return handleResponse(res, 404, "Travel request not found");
  }

  handleResponse(
    res,
    200,
    "Travel request deleted successfully",
    travelRequest
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
