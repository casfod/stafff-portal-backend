// controllers/projectController.js
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const projectService = require("../services/projectService");

// Create a new project
const createProject = catchAsync(async (req, res) => {
  const project = await projectService.createProject(req.body);
  handleResponse(res, 201, "Project created successfully", project);
});

// Get all projects
const getAllProjects = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;
  const projects = await projectService.getAllProjects({
    search,
    sort,
    page,
    limit,
  });
  handleResponse(res, 200, "All projects fetched successfully", projects);
});

//Get stats
const getStats = catchAsync(async (req, res) => {
  const stats = await projectService.getProjectsStats();

  handleResponse(res, 200, "Project stats fetched successfully", stats);
});

// Get a project by ID
const getProjectById = catchAsync(async (req, res) => {
  const project = await projectService.getProjectById(req.params.id);
  handleResponse(res, 200, "Project fetched successfully", project);
});

// Update a project by ID
const updateProject = catchAsync(async (req, res) => {
  const project = await projectService.updateProject(req.params.id, req.body);
  handleResponse(res, 200, "Project updated successfully", project);
});

// Delete a project by ID
const deleteProject = catchAsync(async (req, res) => {
  const project = await projectService.deleteProject(req.params.id);
  handleResponse(res, 200, "Project deleted successfully", project);
});

module.exports = {
  createProject,
  getStats,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
};
