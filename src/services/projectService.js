// services/projectService.js
const Project = require("../models/ProjectModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const handleFileUploads = require("../utils/FileUploads");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");

const getProjectsStats = async () => {
  // 1. Total number of requests
  const totalProjects = await Project.countDocuments();

  // Return the stats
  return {
    totalProjects,
  };
};

// Get all projects with filtering, sorting, and pagination
const getAllProjects = async (queryParams) => {
  const { search, sort, page = 1, limit = Infinity } = queryParams;

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

  // Fetch associated files
  const projectsWithFiles = await Promise.all(
    projects.map(async (project) => {
      const files = await fileService.getFilesByDocument(
        "Projects",
        project._id
      );
      return {
        ...project.toJSON(),
        files,
      };
    })
  );

  return {
    projects: projectsWithFiles,
    totalProjects: total,
    totalPages,
    currentPage,
  };
};

// Other service methods remain the same
const createProject = async (projectData, files = []) => {
  const project = new Project(projectData);
  await project.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: project._id,
      modelTable: "Projects",
    });
  }

  return project;
};

const getProjectById = async (id) => {
  const project = await Project.findById(id).lean();
  if (!project) {
    throw new Error("Project not found");
  }
  const files = await fileService.getFilesByDocument("Projects", id);

  return {
    ...project,
    files,
  };
};

const updateProject = async (id, updateData, files = []) => {
  if (files.length > 0) {
    await fileService.deleteFilesByDocument("Projects", id);

    await handleFileUploads({
      files,
      requestId: id,
      modelTable: "Projects",
    });
  }
  // Handle file uploads if any

  const project = await Project.findByIdAndUpdate(id, updateData, {
    new: true,
  });
  if (!project) {
    throw new Error("Project not found");
  }
  return project;
};

const deleteProject = async (id) => {
  await fileService.deleteFilesByDocument("Projects", id);

  const project = await Project.findByIdAndDelete(id);
  if (!project) {
    throw new Error("Project not found");
  }
  return project;
};

module.exports = {
  createProject,
  getProjectsStats,
  getAllProjects,
  getProjectById,
  updateProject,
  deleteProject,
};
