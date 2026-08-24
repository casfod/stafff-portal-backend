import { Project, IProject } from "../models";
import { fileService } from "./file.service";
import { BaseQueryParams } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";
import { logger } from "../utils/logger";

// ─── Stats ────────────────────────────────────────────────────────────────────
export async function getProjectsStats(): Promise<any> {
  const totalProjects = await Project.countDocuments();
  return ResponseBuilder.stats({ totalProjects }, "Project statistics retrieved successfully");
}

// ─── List ─────────────────────────────────────────────────────────────────────
const ALLOWED_SORT_FIELDS = new Set([
  "createdAt",
  "-createdAt",
  "projectTitle",
  "-projectTitle",
  "donor",
  "-donor",
  "projectCode",
  "-projectCode",
  "updatedAt",
  "-updatedAt",
]);

export async function getAllProjects(params: BaseQueryParams & Record<string, unknown>): Promise<any> {
  const { search, sort, page = 1, limit, status, projectCode, dateFrom, dateTo } = params;
  const isUnlimited = !limit;
  const lim = Number(limit ?? 9999);
  const skip = (Number(page) - 1) * lim;

  const query: Record<string, unknown> = {};
  if (search) {
    const re = new RegExp(String(search).trim().split(/\s+/).join("|"), "i");
    query.$or = [{ projectTitle: re }, { donor: re }, { projectCode: re }];
  }

  // Structured filters — same shape as the filterableFields config used by
  // the workflow-service.factory-backed services, hand-applied here since
  // projects don't go through that factory.
  if (status && String(status).trim() !== "") {
    query.status = String(status).trim();
  }
  if (projectCode && String(projectCode).trim() !== "") {
    const escaped = String(projectCode).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    query.projectCode = new RegExp(escaped, "i");
  }
  if (dateFrom || dateTo) {
    const range: { $gte?: Date; $lte?: Date } = {};
    if (dateFrom) {
      const from = new Date(String(dateFrom));
      if (!isNaN(from.getTime())) range.$gte = from;
    }
    if (dateTo) {
      const to = new Date(String(dateTo));
      if (!isNaN(to.getTime())) {
        to.setHours(23, 59, 59, 999);
        range.$lte = to;
      }
    }
    if (Object.keys(range).length > 0) query.createdAt = range;
  }

  let sortField = "-createdAt";
  if (sort && typeof sort === "string" && sort.trim() !== "") {
    const trimmedSort = sort.trim();
    if (ALLOWED_SORT_FIELDS.has(trimmedSort)) {
      sortField = trimmedSort;
    } else {
      console.warn(`Invalid sort field provided: ${trimmedSort}, using default`);
    }
  }

  const [items, total] = await Promise.all([
    Project.find(query)
      .sort(sortField)
      .skip(skip)
      .limit(isUnlimited ? 0 : lim),
    Project.countDocuments(query),
  ]);

  // Was: items.map(async (p) => fileService.getFilesByModel(...)) — one DB
  // round trip per project on the page (N+1). Batched into a single query.
  const filesByDoc = await fileService.getFilesByModelBatch(
    "Projects",
    items.map((p) => String(p._id))
  );
  const withFiles = items.map((p) => ({
    ...p.toJSON(),
    files: filesByDoc.get(String(p._id)) ?? [],
  }));

  const pagination = ResponseBuilder.getPaginationMeta(Number(page), isUnlimited ? total : lim, total);
  return ResponseBuilder.list(withFiles, pagination, "Projects retrieved successfully");
}

// ─── Get by ID ────────────────────────────────────────────────────────────────
export async function getProjectById(id: string): Promise<any> {
  const project = await Project.findById(id).lean();
  if (!project) throw new Error("Project not found");
  const files = await fileService.getFilesByModel("Projects", id);
  return ResponseBuilder.single({ ...project, files }, "Project retrieved successfully");
}

// ─── Create ───────────────────────────────────────────────────────────────────
export async function createProject(data: Partial<IProject>, files: Express.Multer.File[] = []): Promise<any> {
  logger.info(`Creating project with data: ${JSON.stringify(data)} and ${files.length} files`);
  const project = new Project(data);
  await project.save();
  if (files.length) await fileService.handleFileUploads(files, String(project._id), "Projects");
  return ResponseBuilder.operation(project, "Project created successfully");
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateProject(id: string, data: Partial<IProject>, files: Express.Multer.File[] = []): Promise<any> {
  if (files.length) {
    await fileService.deleteFilesByModel("Projects", id);
    await fileService.handleFileUploads(files, id, "Projects");
  }

  const project = await Project.findByIdAndUpdate(id, data, { new: true });
  if (!project) throw new Error("Project not found");
  return ResponseBuilder.operation(project, "Project updated successfully");
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteProject(id: string): Promise<any> {
  await fileService.deleteFilesByModel("Projects", id);
  const project = await Project.findByIdAndDelete(id);
  if (!project) throw new Error("Project not found");
  return ResponseBuilder.operation(project, "Project deleted successfully");
}