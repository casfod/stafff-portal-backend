// routes/projectRoutes.js
const express = require("express");
const projectController = require("../controllers/projectController");
const protect = require("../middleware/protect");
const restrictTo = require("../middleware/restrictTo");

const projectRouter = express.Router();

projectRouter.use(protect);

// Get all projects
projectRouter.get("/", projectController.getAllProjects);

// Get a project by ID
projectRouter.get("/:id", projectController.getProjectById);

projectRouter.use(restrictTo("SUPER-ADMIN"));

// Create a new project
projectRouter.post("/", projectController.createProject);

// Update a project by ID
projectRouter.put("/:id", projectController.updateProject);

// Delete a project by ID
projectRouter.delete("/:id", projectController.deleteProject);

module.exports = projectRouter;
