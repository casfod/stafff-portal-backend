// routes/projectRoutes.js
const express = require("express");
const projectController = require("../controllers/projectController");
const protect = require("../middleware/protect");
const restrictTo = require("../middleware/restrictTo");
const { upload } = require("../controllers/fileController");

const projectRouter = express.Router();

projectRouter.use(protect);

// Get all projects stats
projectRouter.get("/stats", projectController.getStats);

// Get all projects
projectRouter.get("/", projectController.getAllProjects);

// Get a project by ID
projectRouter.get("/:id", projectController.getProjectById);

projectRouter.use(restrictTo("SUPER-ADMIN"));

// Create a new project
projectRouter.post(
  "/",
  upload.array("files", 10),
  projectController.createProject
);

// Update a project by ID
projectRouter.put(
  "/:id",
  upload.array("files", 10),
  projectController.updateProject
);

// Delete a project by ID
projectRouter.delete("/:id", projectController.deleteProject);

module.exports = projectRouter;
