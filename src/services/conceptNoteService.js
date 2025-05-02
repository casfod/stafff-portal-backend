// services/projectService.js
const ConceptNote = require("../models/ConceptNoteModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");

const getConceptNoteStats = async (currentUser) => {
  if (!currentUser?._id) {
    throw new Error("Invalid user information");
  }

  // Initialize base match conditions
  const baseMatch = {
    status: { $ne: "draft" },
  };

  // Role-based filtering using switch
  switch (currentUser.role) {
    case "SUPER-ADMIN":
      //  case "ADMIN":
      // No additional filters for admin roles
      break;

    default:
      // For all other roles, only count their own requests
      baseMatch.preparedBy = currentUser._id;
      break;
  }

  const stats = await ConceptNote.aggregate([
    {
      $match: baseMatch,
    },
    {
      $facet: {
        totalRequests: [{ $count: "count" }],
        totalApprovedRequests: [
          { $match: { status: "approved" } },
          { $count: "count" },
        ],
      },
    },
  ]);

  return {
    totalRequests: stats[0].totalRequests[0]?.count || 0,
    totalApprovedRequests: stats[0].totalApprovedRequests[0]?.count || 0,
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
    { path: "project", select: "project_code account_code" },
    { path: "preparedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" }, // Simplified path
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
  conceptNoteData.comments = undefined;
  const conceptNote = new ConceptNote({ ...conceptNoteData, status: "draft" });
  await conceptNote.save();
  return conceptNote;
};

// Get a single purchase request by ID
const getConceptNoteById = async (id) => {
  return await ConceptNote.findById(id).populate("preparedBy", "email");
};

const updateConceptNote = async (id, updateData) => {
  // if (updateData.approvedBy) {
  //   updateData = { ...updateData, status: "pending" };
  // }

  const conceptNote = await ConceptNote.findByIdAndUpdate(id, updateData, {
    new: true,
  });

  // if (!conceptNote) {
  //   throw new Error("Concept Note not found");
  // }
  return conceptNote;
};

// const updateRequestStatus = async (id, data) => {
//   return await ConceptNote.findByIdAndUpdate(id, data, { new: true });
// };

const deleteConceptNote = async (id) => {
  const conceptNote = await ConceptNote.findByIdAndDelete(id);
  if (!conceptNote) {
    throw new Error("Concept Note not found");
  }
  return conceptNote;
};

const updateRequestStatus = async (id, data, currentUser) => {
  // Fetch the existing Concept Note
  const existingConceptNote = await ConceptNote.findById(id);
  if (!existingConceptNote) {
    throw new Error("Concept Note not found");
  }

  if (!currentUser) {
    throw new Error("Unauthorized");
  }

  // Add a new comment if it exists in the request body
  if (data.comment) {
    // Initialize comments as an empty array if it doesn't exist
    if (!existingConceptNote.comments) {
      existingConceptNote.comments = [];
    }

    // Add the new comment to the top of the comments array
    existingConceptNote.comments.unshift({
      user: currentUser.id,
      text: data.comment,
    });

    // Update the data object to include the modified comments
    data.comments = existingConceptNote.comments;
  }

  // Update the status and other fields
  if (data.status) {
    existingConceptNote.status = data.status;
  }

  // Save and return the updated Concept Note
  return await existingConceptNote.save();
};

module.exports = {
  saveConceptNote,
  createConceptNote,
  getConceptNoteStats,
  getAllConceptNotes,
  getConceptNoteById,
  updateConceptNote,
  updateRequestStatus,
  deleteConceptNote,
};
