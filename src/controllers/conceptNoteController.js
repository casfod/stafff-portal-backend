const conceptNoteService = require("../services/conceptNoteService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");

//Get stats
const getStats = catchAsync(async (req, res) => {
  const stats = await conceptNoteService.getConceptNoteStats();

  handleResponse(res, 200, "Concept notes stats fetched successfully", stats);
});

// Create a new concept note
const createConceptNote = catchAsync(async (req, res) => {
  // Get current user from token (moved to auth middleware)
  const currentUser = await userByToken(req, res); // Assuming user is attached to req by auth middleware

  // Prepare concept note data
  const conceptNoteData = {
    ...req.body,
    staff_Name: `${currentUser.first_name} ${currentUser.last_name}`,
    staff_role: currentUser.role,
    prepared_by: currentUser.id,
  };

  // Create concept note
  const conceptNote = await conceptNoteService.createConceptNote(
    conceptNoteData
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

// Get concept note statistics
const getConceptNoteStats = catchAsync(async (req, res) => {
  const stats = await conceptNoteService.getConceptNoteStats();
  handleResponse(
    res,
    200,
    "Concept note statistics fetched successfully",
    stats
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
  const conceptNote = await conceptNoteService.updateConceptNote(
    req.params.id,
    req.body
  );
  handleResponse(res, 200, "Concept note updated successfully", conceptNote);
});

// Delete concept note
const deleteConceptNote = catchAsync(async (req, res) => {
  await conceptNoteService.deleteConceptNote(req.params.id);
  handleResponse(res, 200, "Concept note deleted successfully");
});

module.exports = {
  getStats,
  createConceptNote,
  saveConceptNote,
  getConceptNoteStats,
  getAllConceptNotes,
  getConceptNoteById,
  updateConceptNote,
  deleteConceptNote,
};
