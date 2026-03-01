// routes/appraisalRoutes.js
const express = require("express");
const {
  saveDraft,
  submit,
  getAll,
  getById,
  update,
  updateObjectives,
  sign,
  getStats,
  remove,
  addComment,
  updateComment,
  deleteComment,
} = require("../controllers/appraisalController");
const protect = require("../middleware/protect");
const { upload } = require("../controllers/fileController");

const appraisalRouter = express.Router();

appraisalRouter.use(protect);

// ========== STATS ==========
appraisalRouter.get("/stats", getStats);

// ========== CREATE / SAVE ==========
appraisalRouter.post("/save", saveDraft);
appraisalRouter.post("/:id/submit", submit);

// ========== READ ==========
appraisalRouter.get("/", getAll);
appraisalRouter.get("/:id", getById);

// ========== UPDATE ==========
appraisalRouter.put("/:id", upload.array("files", 10), update);
appraisalRouter.patch("/:id/objectives", updateObjectives);
appraisalRouter.patch("/:id/sign", sign);

// ========== COMMENTS ==========
appraisalRouter.post("/:id/comments", addComment);
appraisalRouter.put("/:id/comments/:commentId", updateComment);
appraisalRouter.delete("/:id/comments/:commentId", deleteComment);

// ========== DELETE ==========
appraisalRouter.delete("/:id", remove);

module.exports = appraisalRouter;
