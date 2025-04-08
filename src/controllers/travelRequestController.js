const {
  saveTravelRequest,
  saveAndSendTravelRequest,
  getTravelRequests,
  getTravelRequestById,
  updateTravelRequest,
  deleteTravelRequest,
  updateRequestStatus,
  getTravelRequestStats,
} = require("../services/travelRequestService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");

const save = catchAsync(async (req, res) => {
  const data = req.body;
  const currentUser = await userByToken(req, res);

  const travelRequest = await saveTravelRequest(data, currentUser);

  handleResponse(res, 201, "Travel request saved successfully", travelRequest);
});

// Save and send a travel request (pending)
const saveAndSend = catchAsync(async (req, res) => {
  const data = req.body;

  const currentUser = await userByToken(req, res);

  const travelRequest = await saveAndSendTravelRequest(data, currentUser);

  handleResponse(
    res,
    201,
    "Travel request saved and sent successfully",
    travelRequest
  );
});

//Get stats
const getStats = catchAsync(async (req, res) => {
  const stats = await getTravelRequestStats();

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
  const { id } = req.params;
  const data = req.body;
  const travelRequest = await updateTravelRequest(id, data);
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

  // Fetch the existing Travel request
  const existingTravelRequest = await getTravelRequestById(id);
  if (!existingTravelRequest) {
    return handleResponse(res, 404, "Travel request not found");
  }

  // Fetch the current user
  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  // Add a new comment if it exists in the request body
  if (data.comment) {
    // Initialize comments as an empty array if it doesn't exist
    if (!existingTravelRequest.comments) {
      existingTravelRequest.comments = [];
    }

    // Add the new comment to the top of the comments array
    existingTravelRequest.comments.unshift({
      user: currentUser.id, // Add the current user's ID
      text: data.comment, // Add the comment text (using the new `text` field)
    });

    // Update the data object to include the modified comments
    data.comments = existingTravelRequest.comments;
  }

  // Update the status and other fields
  if (data.status) {
    existingTravelRequest.status = data.status;
  }

  // Save the updated Travel request
  const updatedTravelRequest = await existingTravelRequest.save();

  // Send success response
  handleResponse(
    res,
    200,
    "Travel request status updated",
    updatedTravelRequest
  );
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
  save,
  saveAndSend,
  getAll,
  getStats,
  getById,
  update,
  updateStatus,
  remove,
};
