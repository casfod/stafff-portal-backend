// services/projectService.js
const ConceptNote = require("../models/conceptNoteModel.js");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");

const getConceptNoteStats = async () => {
  // 1. Total number of ConceptNote
  const totalConceptNotes = await ConceptNote.countDocuments();

  // 2. Total number of approved ConceptNote
  const totalApprovedConceptNotes = await ConceptNote.countDocuments({
    status: "approved",
  });

  // Return the stats
  return {
    totalConceptNotes,
    totalApprovedConceptNotes,
  };
};

const getAllConceptNotes = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = Infinity } = queryParams;

  // Define the fields you want to search in
  const searchFields = ["Staff_Name", "activity_title", "project_code"];

  // Build the query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  const query = buildQuery(searchTerms, searchFields);

  switch (currentUser.role) {
    case "STAFF":
      query.preparedBy = currentUser._id; // STAFF can only see their own requests
      break;

    case "ADMIN":
      query.$or = [
        { preparedBy: currentUser._id }, // Requests they created
        { approvedBy: currentUser._id }, // Requests they reviewed
      ];
      break;

    case "REVIEWER":
      query.$or = [
        { preparedBy: currentUser._id }, // Requests they created
      ];
      break;

    case "SUPER-ADMIN":
      query.$or = [
        { status: { $ne: "draft" } }, // All requests except drafts
        { preparedBy: currentUser._id, status: "draft" }, // Their own drafts
      ];
      break;

    default:
      throw new Error("Invalid user role");
  }

  // Build the sort object
  const sortQuery = buildSortQuery(sort);

  const populateOptions = [
    { path: "preparedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
  ];

  // Fetch projects with filters, sorting, and pagination
  const {
    results: conceptNotes,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    ConceptNote,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  return {
    conceptNotes,
    totalConceptNote: total,
    totalPages,
    currentPage,
  };
};

const createConceptNote = async (conceptNoteData) => {
  const conceptNote = new ConceptNote({
    ...conceptNoteData,
    status: "pending",
  });
  await conceptNote.save();
  return conceptNote;
};

// // Create a new Concept Note
// const createPurchaseRequest = async (data) => {
//   const purchaseRequest = new PurchaseRequest(data);
//   return await purchaseRequest.save();
// };

// Save a Concept Note (draft)
const saveConceptNote = async (conceptNoteData) => {
  const conceptNote = new ConceptNote({ ...conceptNoteData, status: "draft" });
  await conceptNote.save();
  return conceptNote;
};

const getConceptNoteById = async (id) => {
  const conceptNote = await ConceptNote.findById(id);
  if (!conceptNote) {
    throw new Error("Concept Note not found");
  }
  return conceptNote;
};

const updateConceptNote = async (id, updateData) => {
  const conceptNote = await ConceptNote.findByIdAndUpdate(id, updateData, {
    new: true,
  });
  if (!conceptNote) {
    throw new Error("Concept Note not found");
  }
  return conceptNote;
};

const deleteConceptNote = async (id) => {
  const conceptNote = await ConceptNote.findByIdAndDelete(id);
  if (!conceptNote) {
    throw new Error("Concept Note not found");
  }
  return conceptNote;
};

module.exports = {
  saveConceptNote,
  createConceptNote,
  getConceptNoteStats,
  getAllConceptNotes,
  getConceptNoteById,
  updateConceptNote,
  deleteConceptNote,
};
