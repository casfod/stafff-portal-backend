const conceptNoteService = require("../services/conceptNoteService");
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

  const conceptNote = await getConceptNoteById(id);
  if (!conceptNote) {
    throw new appError("Advance request not found", 404);
  }

  const updatedRequest =
    await conceptNoteService.ConceptNoteCopyService.copyDocument({
      userId: currentUser._id,
      requestId: id,
      requestType: "conceptNote",
      requestTitle: "Concept Note",
      recipients: userIds,
    });

  handleResponse(res, 200, "Request copied successfully", updatedRequest);
});

//Get stats
const getStats = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const stats = await conceptNoteService.getConceptNoteStats(currentUser);

  handleResponse(res, 200, "Concept notes stats fetched successfully", stats);
});

// Create a new concept note
const createConceptNote = catchAsync(async (req, res) => {
  req.body.activity_period = parseJsonField(req.body, "activity_period", true);

  // Get current user from token (moved to auth middleware)
  const currentUser = await userByToken(req, res); // Assuming user is attached to req by auth middleware

  // Prepare concept note data
  const conceptNoteData = {
    ...req.body,
    staff_name: `${currentUser.first_name} ${currentUser.last_name}`,
    staff_role: currentUser.role,
    preparedBy: currentUser.id,
  };

  const files = req.files || [];

  // Create concept note
  const conceptNote = await conceptNoteService.createConceptNote(
    currentUser,
    conceptNoteData,
    files
  );

  // Return response
  handleResponse(res, 201, "Concept note created successfully", conceptNote);
});

const saveConceptNote = catchAsync(async (req, res) => {
  // Get current user from token (moved to auth middleware)
  const currentUser = await userByToken(req, res); // Assuming user is attached to req by auth middleware

  // Prepare concept note data
  const conceptNoteData = {
    ...req.body,
    staff_name: `${currentUser.first_name} ${currentUser.last_name}`,
    staff_role: currentUser.role,
    preparedBy: currentUser.id,
  };

  // Create concept note
  const conceptNote = await conceptNoteService.saveConceptNote(conceptNoteData);

  // Return response
  handleResponse(
    res,
    201,
    "Concept note draft created successfully",
    conceptNote
  );
});

// Get all concept notes
const getAllConceptNotes = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res); // Assuming user is attached to req by auth middleware

  const { search, sort, page, limit } = req.query;
  const result = await conceptNoteService.getAllConceptNotes(
    {
      search,
      sort,
      page,
      limit,
    },
    currentUser
  );
  handleResponse(res, 200, "Concept notes fetched successfully", result);
});

// Get concept note by ID
const getConceptNoteById = catchAsync(async (req, res) => {
  const conceptNote = await conceptNoteService.getConceptNoteById(
    req.params.id
  );
  handleResponse(res, 200, "Concept note fetched successfully", conceptNote);
});

// Update concept note
const updateConceptNote = catchAsync(async (req, res) => {
  const files = req.files || [];
  const conceptNote = await conceptNoteService.updateConceptNote(
    req.params.id,
    req.body,
    files
  );
  handleResponse(res, 200, "Concept note updated successfully", conceptNote);
});

const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  // Fetch the current user
  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const updatedRequest = await conceptNoteService.updateRequestStatus(
    id,
    data,
    currentUser
  );

  handleResponse(res, 200, "Request status updated", updatedRequest);
});

// Delete concept note
const deleteConceptNote = catchAsync(async (req, res) => {
  await conceptNoteService.deleteConceptNote(req.params.id);
  handleResponse(res, 200, "Concept note deleted successfully");
});

module.exports = {
  copyRequest,
  getStats,
  updateStatus,
  createConceptNote,
  saveConceptNote,
  getAllConceptNotes,
  getConceptNoteById,
  updateConceptNote,
  deleteConceptNote,
};
