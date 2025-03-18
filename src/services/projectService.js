// services/projectService.js
const Project = require("../models/ProjectModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");

// Get all projects with filtering, sorting, and pagination
const getAllProjects = async (queryParams) => {
  const { search, sort, page = 1, limit = 10 } = queryParams;

  // Define the fields you want to search in
  const searchFields = ["project_title", "donor", "project_code"];

  // Build the query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  const query = buildQuery(searchTerms, searchFields);

  // Build the sort object
  const sortQuery = buildSortQuery(sort);

  // Fetch projects with filters, sorting, and pagination
  const {
    results: projects,
    total,
    totalPages,
    currentPage,
  } = await paginate(Project, query, { page, limit }, sortQuery);

  return {
    projects,
    totalProjects: total,
    totalPages,
    currentPage,
  };
};

// Other service methods remain the same
const createProject = async (projectData) => {
  const project = new Project(projectData);
  await project.save();
  return project;
};

const getProjectById = async (id) => {
  const project = await Project.findById(id);
  if (!project) {
    throw new Error("Project not found");
  }
  return project;
};

const updateProject = async (id, updateData) => {
  const project = await Project.findByIdAndUpdate(id, updateData, {
    new: true,
  });
  if (!project) {
    throw new Error("Project not found");
  }
  return project;
};

const deleteProject = async (id) => {
  const project = await Project.findByIdAndDelete(id);
  if (!project) {
    throw new Error("Project not found");
  }
  return project;
};

module.exports = {
  createProject,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
};
