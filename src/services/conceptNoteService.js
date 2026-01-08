// services/projectService.js
const ConceptNote = require("../models/ConceptNoteModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");
const handleFileUploads = require("../utils/FileUploads");
const notify = require("../utils/notify");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const BaseCopyService = require("./BaseCopyService");

class copyService extends BaseCopyService {
  constructor() {
    super(ConceptNote, "ConceptNote");
  }
}

const ConceptNoteCopyService = new copyService();

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
  const searchFields = ["staff_name", "activity_title", "account_Code"];

  // Build the query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  const query = buildQuery(searchTerms, searchFields);

  switch (currentUser.role) {
    case "STAFF":
      query.$or = [
        { preparedBy: currentUser._id },
        { copiedTo: currentUser._id },
      ];
      // STAFF can only see their own requests
      break;

    case "ADMIN":
      query.$or = [
        { preparedBy: currentUser._id }, // Requests they created
        { approvedBy: currentUser._id }, // Requests they approved
        { copiedTo: currentUser._id },
      ];
      break;

    case "REVIEWER":
      query.$or = [
        { preparedBy: currentUser._id }, // Requests they created
        { reviewedBy: currentUser._id }, // Requests they reviewed
        { copiedTo: currentUser._id },
      ];
      break;

    case "SUPER-ADMIN":
      query.$or = [
        { status: { $ne: "draft" } }, // All requests except drafts
        { preparedBy: currentUser._id, status: "draft" }, // Their own drafts
        { copiedTo: currentUser._id },
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
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
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

  // Fetch concepNotes associated files
  const concepNotesWithFiles = await Promise.all(
    conceptNotes.map(async (claim) => {
      if (!claim || !claim._id) {
        console.warn("Invalid claim encountered:", claim);
        return null;
      }

      const files = await fileService.getFilesByDocument(
        "ConceptNotes",
        claim._id
      );
      return {
        ...claim.toJSON(),
        files,
      };
    })
  );

  const filteredNotes = concepNotesWithFiles.filter(Boolean);

  return {
    conceptNotes: filteredNotes,
    totalConceptNote: total,
    totalPages,
    currentPage,
  };
};

const createConceptNote = async (currentUser, conceptNoteData, files = []) => {
  // For concept notes, when sending (pending), we need reviewedBy
  if (!conceptNoteData.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }

  const conceptNote = new ConceptNote({
    ...conceptNoteData,
    status: "pending",
  });
  await conceptNote.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: conceptNote._id,
      modelTable: "ConceptNotes",
    });
  }

  // Send notification to reviewers
  notify.notifyReviewers({
    request: conceptNote,
    currentUser: currentUser,
    requestType: "conceptNote",
    title: "Concept Note",
    header: "You have been assigned a concept note to review",
  });

  return conceptNote;
};

// Save a Concept Note (draft)
const saveConceptNote = async (conceptNoteData) => {
  conceptNoteData.comments = undefined;
  const conceptNote = new ConceptNote({ ...conceptNoteData, status: "draft" });
  await conceptNote.save();
  return conceptNote;
};

// Get a single purchase request by ID
const getConceptNoteById = async (id) => {
  const populateOptions = [
    { path: "project", select: "project_code account_code" },
    { path: "preparedBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  const request = await ConceptNote.findById(id)
    .populate(populateOptions)
    .lean();

  if (!request) {
    throw new Error("Concept Note not found");
  }

  // Fetch associated files
  const files = await fileService.getFilesByDocument("ConceptNotes", id);

  return normalizeId({
    ...request,
    files: normalizeFiles(files),
  });
};

const updateConceptNote = async (id, updateData, files = [], currentUser) => {
  const conceptNote = await ConceptNote.findByIdAndUpdate(id, updateData, {
    new: true,
  });

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: conceptNote._id,
      modelTable: "ConceptNotes",
    });
  }

  if (conceptNote.status === "reviewed") {
    notify.notifyApprovers({
      request: conceptNote,
      currentUser: currentUser,
      requestType: "conceptNote",
      title: "Concept Note",
      header: "A request has been reviewed and needs your approval",
    });
  }

  return conceptNote;
};

const deleteConceptNote = async (id) => {
  await fileService.deleteFilesByDocument("ConceptNotes", id);

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

  // Handle status transitions and user assignments
  if (data.status) {
    existingConceptNote.status = data.status;

    // Set reviewedBy when status changes to "reviewed"
    if (data.status === "reviewed") {
      existingConceptNote.reviewedBy = currentUser._id;

      // If approver is defined, assign it
      if (data.approvedBy) {
        existingConceptNote.approvedBy = data.approvedBy;
      }
    }

    // Set approvedBy when status changes to "approved"
    if (data.status === "approved") {
      existingConceptNote.approvedBy = currentUser._id;
    }

    // Set reviewedBy to null when rejected (to allow re-review)
    if (data.status === "rejected") {
      existingConceptNote.reviewedBy = null;
      existingConceptNote.approvedBy = null;
    }
  }

  // Save the updated Concept Note
  const updatedConceptNote = await existingConceptNote.save();

  // Enhanced notifications based on status transition
  if (data.status === "reviewed") {
    // Also notify the creator
    notify.notifyCreator({
      request: updatedConceptNote,
      currentUser: currentUser,
      requestType: "conceptNote",
      title: "Concept Note",
      header: "Your request has been reviewed",
    });
  } else if (data.status === "approved" || data.status === "rejected") {
    // Notify the creator when approved or rejected
    notify.notifyCreator({
      request: updatedConceptNote,
      currentUser: currentUser,
      requestType: "conceptNote",
      title: "Concept Note",
      header: `Your request has been ${data.status}`,
    });

    // If approved, also notify the reviewer

    notify.notifyReviewers({
      request: updatedConceptNote,
      currentUser: currentUser,
      requestType: "conceptNote",
      title: "Concept Note",
      header: `This request has been ${data.status}`,
    });
  }

  // Return the updated Concept Note
  return updatedConceptNote;
};

module.exports = {
  ConceptNoteCopyService,
  saveConceptNote,
  createConceptNote,
  getConceptNoteStats,
  getAllConceptNotes,
  getConceptNoteById,
  updateConceptNote,
  updateRequestStatus,
  deleteConceptNote,
};
