const {
  savePurchaseRequest,
  saveAndSendPurchaseRequest,
  getPurchaseRequests,
  getPurchaseRequestById,
  updatePurchaseRequest,
  deletePurchaseRequest,
  updateRequestStatus,
} = require("../services/purchaseRequestService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");

// // Create a new purchase request
// const create = catchAsync(async (req, res) => {
//   const data = req.body;
//   const purchaseRequest = await createPurchaseRequest(data);

//   handleResponse(
//     res,
//     201,
//     "Purchase request created successfully",
//     purchaseRequest
//   );
// });

// Save a purchase request (draft)
const save = catchAsync(async (req, res) => {
  const data = req.body;
  const currentUser = await userByToken(req, res);

  data.createdBy = currentUser._id;
  data.requestedBy = `${currentUser.first_name} ${currentUser.last_name}`;

  const purchaseRequest = await savePurchaseRequest(data);

  handleResponse(
    res,
    201,
    "Purchase request saved successfully",
    purchaseRequest
  );
});

// Save and send a purchase request (pending)
const saveAndSend = catchAsync(async (req, res) => {
  const data = req.body;

  const currentUser = await userByToken(req, res);

  data.createdBy = currentUser._id;
  data.requestedBy = `${currentUser.first_name} ${currentUser.last_name}`;

  const purchaseRequest = await saveAndSendPurchaseRequest(data);

  handleResponse(
    res,
    201,
    "Purchase request saved and sent successfully",
    purchaseRequest
  );
});

// Get all purchase requests
const getAll = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;
  const currentUser = await userByToken(req, res);

  const purchaseRequests = await getPurchaseRequests(
    { search, sort, page, limit },
    currentUser
  );

  handleResponse(
    res,
    200,
    "All purchase requests fetched successfully",
    purchaseRequests
  );
});

// Get a single purchase request by ID
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const purchaseRequest = await getPurchaseRequestById(id);
  if (!purchaseRequest) {
    return handleResponse(res, 404, "Purchase request not found");
  }

  handleResponse(
    res,
    200,
    "Purchase request fetched successfully",
    purchaseRequest
  );
});

// Update a purchase request
const update = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const purchaseRequest = await updatePurchaseRequest(id, data);
  if (!purchaseRequest) {
    return handleResponse(res, 404, "Purchase request not found");
  }

  handleResponse(
    res,
    200,
    "Purchase request updated successfully",
    purchaseRequest
  );
});

// UpdateStatus a purchase request
// const updateStatus = catchAsync(async (req, res) => {
//   const { id } = req.params;
//   const currentUser = await userByToken(req, res);

//   const data = req.body;

//   const purchaseRequest = await updateRequestStatus(id, data);
//   if (!purchaseRequest) {
//     return handleResponse(res, 404, "Purchase request not found");
//   }

//   handleResponse(res, 200, "Purchase request status updated", purchaseRequest);
// });

const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  // Fetch the existing purchase request
  const existingPurchaseRequest = await getPurchaseRequestById(id);
  if (!existingPurchaseRequest) {
    return handleResponse(res, 404, "Purchase request not found");
  }

  // Fetch the current user
  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  // Add a new comment if it exists in the request body
  if (data.comment) {
    // Initialize comments as an empty array if it doesn't exist
    if (!existingPurchaseRequest.comments) {
      existingPurchaseRequest.comments = [];
    }

    // Add the new comment to the top of the comments array
    existingPurchaseRequest.comments.unshift({
      user: currentUser.id, // Add the current user's ID
      text: data.comment, // Add the comment text (using the new `text` field)
    });

    // Update the data object to include the modified comments
    data.comments = existingPurchaseRequest.comments;
  }

  // Update the status and other fields
  if (data.status) {
    existingPurchaseRequest.status = data.status;

    // // Update `reviewedBy` if the status is "reviewed"
    // if (data.status === "reviewed") {
    //   existingPurchaseRequest.reviewedBy = currentUser.id;
    // }

    // // Update `approvedBy` if the status is "approved"
    // if (data.status === "approved") {
    //   existingPurchaseRequest.approvedBy = currentUser.id;
    // }
  }

  // Save the updated purchase request
  const updatedPurchaseRequest = await existingPurchaseRequest.save();

  // Send success response
  handleResponse(
    res,
    200,
    "Purchase request status updated",
    updatedPurchaseRequest
  );
});

// Delete a purchase request
const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const purchaseRequest = await deletePurchaseRequest(id);
  if (!purchaseRequest) {
    return handleResponse(res, 404, "Purchase request not found");
  }

  handleResponse(
    res,
    200,
    "Purchase request deleted successfully",
    purchaseRequest
  );
});

module.exports = {
  save,
  saveAndSend,
  getAll,
  getById,
  update,
  updateStatus,
  remove,
};
