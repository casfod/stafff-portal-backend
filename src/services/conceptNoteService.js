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

const getAllConceptNotes = async (queryParams) => {
  const { search, sort, page = 1, limit = Infinity } = queryParams;

  // Define the fields you want to search in
  const searchFields = ["Staff_Name", "activity_title", "project_code"];

  // Build the query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  const query = buildQuery(searchTerms, searchFields);

  // Build the sort object
  const sortQuery = buildSortQuery(sort);

  // Fetch projects with filters, sorting, and pagination
  const {
    results: conceptNote,
    total,
    totalPages,
    currentPage,
  } = await paginate(ConceptNote, query, { page, limit }, sortQuery);

  return {
    conceptNote,
    totalConceptNote: total,
    totalPages,
    currentPage,
  };
};

const createConceptNote = async (conceptNoteData) => {
  const conceptNote = new ConceptNote(conceptNoteData);
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
  createConceptNote,
  getConceptNoteStats,
  getAllConceptNotes,
  getConceptNoteById,
  updateConceptNote,
  deleteConceptNote,
};
