// src/services/shared/workflow-service.factory.ts
// Removed all file logic - dedicated file services handle this

import mongoose, { Model, PopulateOptions } from "mongoose";
import { z } from "zod";
import { statusUpdateService } from "../status-update.service";
import { BaseCopyService } from "../base-copy.service";
import { notify } from "../notifications/notification.service";
import { addCommentOp, updateCommentOp, deleteCommentOp } from "./comment-ops";
import { buildRoleVisibilityQuery, filterDeleted, parsePaginationParams, validateId, transformDocument } from "./helpers";
import { CurrentUser, BaseQueryParams, StatusUpdatePayload, WorkflowDocument } from "./types";
import { ResponseBuilder } from "./response-builder";

const objectIdSchema = z.string().trim().regex(/^[0-9a-fA-F]{24}$/);

// ─── Base payload schema ──────────────────────────────────────────────────────
const baseWorkflowPayloadSchema = z
  .object({
    reviewedBy: objectIdSchema.optional(),
    approvedBy: objectIdSchema.optional(),
    copiedTo: z.array(objectIdSchema).optional(),
    status: z.string().trim().min(1).optional(),
    comments: z.array(z.object({ text: z.string().trim().min(1) }).passthrough()).optional(),
  })
  .passthrough();

// ─── Extended payload for multi-step review ──────────────────────────────────
const multiStepReviewPayloadSchema = baseWorkflowPayloadSchema.extend({
  financeReviewBy: objectIdSchema.optional(),
  financeReviewStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
  procurementReviewBy: objectIdSchema.optional(),
  procurementReviewStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
}).passthrough();

// ─── Types ──────────────────────────────────────────────────────────────────

export type ReviewStep = {
  field: string;
  statusField: string;
  label: string;
  requiredRoles?: string[];
};

export type FilterFieldConfig =
  | { key: string; type: "exact"; field?: string }
  | { key: string; type: "regex"; field?: string }
  | { key: string; type: "dateFrom" | "dateTo"; field: string };

export interface WorkflowServiceConfig<TDoc extends WorkflowDocument = WorkflowDocument> {
  model: Model<any>;
  label: string;
  requestType: string;
  fileModelName: string; // Kept for reference but NOT used for file operations
  ownerField?: string;
  populate?: PopulateOptions[];
  searchFields?: string[];
  filterableFields?: FilterFieldConfig[];
  useRoleVisibilityQuery?: boolean;
  allowAnyReviewer?: boolean;
  submissionApproverField?: string;
  notifyApproverOnSubmit?: boolean;
  reviewSteps?: ReviewStep[];
  customStatusTransition?: (doc: any) => string;
  customNotifyReviewers?: (doc: any, currentUser: CurrentUser, requestType: string, title: string) => Promise<void>;
  // Optional custom implementations for services that need special handling
  customGetAll?: (params: BaseQueryParams, currentUser: CurrentUser) => Promise<any>;
  customGetById?: (id: string) => Promise<any>;
  customGetStats?: (currentUser: CurrentUser) => Promise<any>;
  customCreate?: (data: unknown, currentUser: CurrentUser) => Promise<any>;
  customUpdate?: (id: string, data: unknown, currentUser: CurrentUser) => Promise<any>;
  skipStatusTransitionOnUpdate?: (data: unknown) => boolean;
  customDelete?: (id: string) => Promise<any>;
  customUpdateStatus?: (id: string, data: StatusUpdatePayload, currentUser: CurrentUser) => Promise<any>;
}

export interface WorkflowService<TDoc extends WorkflowDocument = WorkflowDocument> {
  copyService: BaseCopyService;
  getStats(currentUser: CurrentUser): Promise<any>;
  getAll(params: BaseQueryParams, currentUser: CurrentUser): Promise<any>;
  getById(id: string): Promise<any>;
  saveDraft(data: unknown, currentUser: CurrentUser): Promise<any>;
  saveAndSubmit(data: unknown, currentUser: CurrentUser): Promise<any>;
  update(id: string, data: unknown, currentUser: CurrentUser): Promise<any>;
  updateStatus(id: string, data: StatusUpdatePayload, currentUser: CurrentUser): Promise<any>;
  remove(id: string): Promise<any>;
  addComment(id: string, currentUser: CurrentUser, text: string): Promise<any>;
  updateComment(id: string, commentId: string, userId: mongoose.Types.ObjectId, text: string): Promise<any>;
  deleteComment(id: string, commentId: string, currentUser: CurrentUser): Promise<any>;
  // Multi-step review methods
  updateReviewStep?(id: string, step: string, reviewerId: string, currentUser: CurrentUser): Promise<any>;
  getReviewStatus?(id: string): Promise<any>;
}

// ─── Factory Function ──────────────────────────────────────────────────────

export function createWorkflowService<TDoc extends WorkflowDocument = WorkflowDocument>(
  cfg: WorkflowServiceConfig<TDoc>
): WorkflowService<TDoc> {
  const {
    model,
    label,
    requestType,
    fileModelName, // Kept for reference but NOT used
    ownerField = "createdBy",
    searchFields = ["status"],
    filterableFields = [],
    useRoleVisibilityQuery = true,
    allowAnyReviewer = false,
    submissionApproverField = "reviewedBy",
    notifyApproverOnSubmit = false,
    reviewSteps = [],
    customStatusTransition,
    customNotifyReviewers,
    skipStatusTransitionOnUpdate,
    customGetAll,
    customGetById,
    customGetStats,
    customCreate,
    customUpdate,
    customDelete,
    customUpdateStatus,
    populate = [
      { path: "createdBy", select: "email firstName lastName role" },
      { path: "reviewedBy", select: "email firstName lastName role" },
      { path: "approvedBy", select: "email firstName lastName role" },
      { path: "comments.user", select: "email firstName lastName role" },
      { path: "copiedTo", select: "email firstName lastName role" },
    ] as PopulateOptions[],
  } = cfg;

  const copyService = new BaseCopyService(model, label);
  const isMultiStep = reviewSteps.length > 0;

  // ─── Helper Functions ──────────────────────────────────────────────────────

  function validateWorkflowPayload(data: unknown, action: "create" | "update") {
    if (data == null || typeof data !== "object" || Array.isArray(data)) {
      throw new Error(`${label} payload must be an object.`);
    }
    const schema = isMultiStep ? multiStepReviewPayloadSchema : baseWorkflowPayloadSchema;
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => issue.message).join(", ");
      throw new Error(`${label} ${action} validation failed: ${details}`);
    }
    return parsed.data;
  }

  function buildStructuredFilters(params: Record<string, unknown>): Record<string, unknown> {
    if (filterableFields.length === 0) return {};
    const conditions: Record<string, unknown> = {};
    const dateRanges: Record<string, { $gte?: Date; $lte?: Date }> = {};

    for (const cfg of filterableFields) {
      const raw = params[cfg.key];
      if (raw === undefined || raw === null || raw === "") continue;
      const value = String(raw).trim();
      if (value === "") continue;

      switch (cfg.type) {
        case "exact":
          conditions[cfg.field ?? cfg.key] = value;
          break;
        case "regex": {
          const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          conditions[cfg.field ?? cfg.key] = new RegExp(escaped, "i");
          break;
        }
        case "dateFrom": {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            dateRanges[cfg.field] = { ...dateRanges[cfg.field], $gte: date };
          }
          break;
        }
        case "dateTo": {
          const date = new Date(value);
          if (!isNaN(date.getTime())) {
            date.setHours(23, 59, 59, 999);
            dateRanges[cfg.field] = { ...dateRanges[cfg.field], $lte: date };
          }
          break;
        }
      }
    }

    for (const [field, range] of Object.entries(dateRanges)) {
      conditions[field] = range;
    }

    return conditions;
  }

  function determineNextStatus(doc: any): string {
    if (customStatusTransition) {
      return customStatusTransition(doc);
    }

    if (!isMultiStep) {
      const status = doc.status || 'pending';
      if (status === 'pending' && doc.reviewedBy) return 'reviewed';
      if (status === 'reviewed' && doc.approvedBy) return 'approved';
      return status;
    }

    let allApproved = true;
    let anyRejected = false;
    let anyPending = false;

    for (const step of reviewSteps) {
      const statusValue = doc[step.statusField];
      if (statusValue === 'rejected') {
        anyRejected = true;
        break;
      }
      if (statusValue === 'pending' || !statusValue) {
        anyPending = true;
        allApproved = false;
        break;
      }
      if (statusValue !== 'approved') {
        allApproved = false;
        break;
      }
    }

    if (anyRejected) return 'rejected';
    if (allApproved) return 'approved';
    if (anyPending) return 'pending';
    return 'reviewed';
  }

  // ─── Core Methods ──────────────────────────────────────────────────────────

  // ── Stats ──────────────────────────────────────────────────────────────────
  async function getStats(currentUser: CurrentUser) {
    if (customGetStats) {
      return customGetStats(currentUser);
    }

    const match: Record<string, unknown> = { status: { $ne: "draft" } };
    if (currentUser.role !== "SUPER-ADMIN") match[ownerField] = currentUser._id;

    const [{ totalRequests, totalApprovedRequests }] = await model.aggregate([
      { $match: match },
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

    const data = {
      totalRequests: totalRequests[0]?.count ?? 0,
      totalApprovedRequests: totalApprovedRequests[0]?.count ?? 0,
    };

    return ResponseBuilder.stats(data, `${label} statistics retrieved successfully`);
  }

  // ── List ───────────────────────────────────────────────────────────────────
  async function getAll(params: BaseQueryParams & Record<string, unknown>, currentUser: CurrentUser) {
    if (customGetAll) {
      return customGetAll(params, currentUser);
    }

    const { search, sort = "-createdAt", page, limit } = params;
    const { page: parsedPage, limit: parsedLimit, skip } = parsePaginationParams(page, limit);

    const query: Record<string, unknown> = {};
    if (search) {
      const re = new RegExp(search.split(/\s+/).join("|"), "i");
      query.$or = searchFields.map((f) => ({ [f]: re }));
    }

    Object.assign(query, buildStructuredFilters(params));
    if (useRoleVisibilityQuery) {
      Object.assign(query, buildRoleVisibilityQuery(currentUser, ownerField, reviewSteps));
    }

    const [items, total] = await Promise.all([
      model
        .find(query)
        .populate(populate)
        .sort(sort)
        .skip(skip)
        .limit(parsedLimit),
      model.countDocuments(query),
    ]);

    // Transform each document (converts _id to id, removes __v, filters comments)
    // NO file logic here - files are handled by dedicated file services
    const transformedItems = items.map((doc) => {
      const docRecord = doc as TDoc & WorkflowDocument;
      docRecord.comments = filterDeleted((docRecord.comments ?? []) as Array<{ deleted?: boolean }>);
      return transformDocument(doc);
    });

    const pagination = ResponseBuilder.getPaginationMeta(parsedPage, parsedLimit, total);
    return ResponseBuilder.list(transformedItems, pagination, `${label}s retrieved successfully`);
  }

  // ── Get by ID ──────────────────────────────────────────────────────────────
  async function getById(id: string) {
    if (customGetById) {
      return customGetById(id);
    }

    const normalizedId = validateId(id, label);
    const doc = await model.findById(normalizedId).populate(populate);
    if (!doc) throw new Error(`${label} not found`);

    if (doc.comments) {
      doc.comments = filterDeleted(doc.comments);
    }

    // NO file logic here - files are handled by dedicated file services
    const transformed = transformDocument(doc);

    return ResponseBuilder.single(transformed, `${label} retrieved successfully`);
  }

  // ── Save draft ─────────────────────────────────────────────────────────────
  async function saveDraft(data: unknown, currentUser: CurrentUser) {
    if (customCreate) {
      return customCreate(data, currentUser);
    }

    const payload = validateWorkflowPayload(data, "create");

    const docData: any = {
      ...payload,
      status: "draft",
      [ownerField]: currentUser._id,
      comments: [],
    };

    if (isMultiStep) {
      for (const step of reviewSteps) {
        docData[step.statusField] = 'pending';
      }
    }

    const doc = new model(docData);
    await doc.save();

    const transformed = transformDocument(doc);
    return ResponseBuilder.operation(transformed, `${label} draft saved successfully`);
  }

  // ── Save and submit ────────────────────────────────────────────────────────
  async function saveAndSubmit(
    data: unknown,
    currentUser: CurrentUser
  ) {
    if (customCreate) {
      return customCreate(data, currentUser);
    }

    const payload = validateWorkflowPayload(data, "create");

    if (isMultiStep) {
      for (const step of reviewSteps) {
        if (!payload[step.field]) {
          throw new Error(`${step.label} is required for submission.`);
        }
      }
    } else if (!(payload as Record<string, unknown>)[submissionApproverField] && !allowAnyReviewer) {
      const fieldLabel = submissionApproverField === "reviewedBy" ? "ReviewedBy" : submissionApproverField;
      throw new Error(`${fieldLabel} field is required for submission.`);
    }

    const docData: any = {
      ...payload,
      status: "pending",
      [ownerField]: currentUser._id,
    };

    if (isMultiStep) {
      for (const step of reviewSteps) {
        docData[step.statusField] = 'pending';
      }
    }

    const doc = new model(docData);
    await doc.save();

    // Notify reviewers
    if (isMultiStep && customNotifyReviewers) {
      await customNotifyReviewers(doc, currentUser, requestType, label);
    } else if (isMultiStep) {
      await notify.notifyPurchaseRequestReviewers({
        request: doc,
        currentUser,
        requestType,
        title: label,
        header: `You have been assigned to review this ${label}`,
      });
    } else if (notifyApproverOnSubmit) {
      await notify.notifyApprovers({
        request: doc,
        currentUser,
        requestType,
        title: label,
        header: `You have been assigned to approve this ${label}`,
      });
    } else {
      await notify.notifyReviewers({
        request: doc,
        currentUser,
        requestType,
        title: label,
        header: `You have been assigned a ${label} to review`,
      });
    }

    const transformed = transformDocument(doc);
    return ResponseBuilder.operation(transformed, `${label} submitted successfully`);
  }

  // ── Update ─────────────────────────────────────────────────────────────────
  async function update(
    id: string,
    data: unknown,
    currentUser: CurrentUser
  ) {
    if (customUpdate) {
      return customUpdate(id, data, currentUser);
    }

    const normalizedId = validateId(id, label);
    const payload = validateWorkflowPayload(data, "update");

    const previous = await model.findById(normalizedId).lean();
    if (!previous) throw new Error(`${label} not found`);

    const doc = await model.findByIdAndUpdate(
      normalizedId,
      payload as Partial<TDoc>,
      { new: true }
    );
    if (!doc) throw new Error(`${label} not found`);

    // Handle status transitions
    if (isMultiStep) {
      const newStatus = determineNextStatus(doc);
      const skipStatusTransition = skipStatusTransitionOnUpdate?.(payload) ?? false;
      if (!skipStatusTransition && newStatus !== doc.status) {
        doc.status = newStatus;
        await doc.save();
      }

      const prevApprovedBy = (previous as any)?.approvedBy?.toString();
      const newApprovedBy = (doc as any).approvedBy?.toString();
      const approverChanged =
        (!prevApprovedBy && !!newApprovedBy) ||
        (!!prevApprovedBy && !!newApprovedBy && prevApprovedBy !== newApprovedBy);

      if (newStatus === 'approved' && approverChanged) {
        const isCurrentUserApprover = newApprovedBy === currentUser._id.toString();
        if (!isCurrentUserApprover) {
          await notify.notifyApprovers({
            request: doc,
            currentUser,
            requestType,
            title: label,
            header: `${label} reviews are complete — awaiting your final decision`,
          });
        }
      }
    } else {
      const prevApprovedBy = (previous as any)?.approvedBy?.toString();
      const newApprovedBy = (doc as any).approvedBy?.toString();
      const approverJustSet = !prevApprovedBy && !!newApprovedBy;
      const approverChanged = !!prevApprovedBy && !!newApprovedBy && prevApprovedBy !== newApprovedBy;

      if (doc.status === "reviewed" && (approverJustSet || approverChanged)) {
        const isCurrentUserApprover = newApprovedBy === currentUser._id.toString();
        if (!isCurrentUserApprover) {
          await notify.notifyApprovers({
            request: doc,
            currentUser,
            requestType,
            title: label,
            header: `A ${label} has been reviewed and needs your approval`,
          });
        }
      }
    }

    const transformed = transformDocument(doc);
    return ResponseBuilder.operation(transformed, `${label} updated successfully`);
  }

  // ── Status update ──────────────────────────────────────────────────────────
  async function updateStatus(
    id: string,
    data: StatusUpdatePayload,
    currentUser: CurrentUser
  ) {
    if (customUpdateStatus) {
      return customUpdateStatus(id, data, currentUser);
    }

    const normalizedId = validateId(id, label);
    const result = await statusUpdateService.updateRequestStatusWithComment({
      Model: model,
      id: normalizedId,
      data,
      currentUser,
      requestType,
      title: label,
    });

    const transformed = transformDocument(result);
    return ResponseBuilder.operation(transformed, `${label} status updated successfully`);
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function remove(id: string) {
    if (customDelete) {
      return customDelete(id);
    }

    const normalizedId = validateId(id, label);
    const result = await model.findByIdAndDelete(normalizedId);
    if (!result) throw new Error(`${label} not found`);

    const transformed = transformDocument(result);
    return ResponseBuilder.operation(transformed, `${label} deleted successfully`);
  }

  // ── Comments ───────────────────────────────────────────────────────────────
  async function addComment(id: string, currentUser: CurrentUser, text: string) {
    const normalizedId = validateId(id, label);
    const trimmedText = text?.trim();
    if (!trimmedText) throw new Error("Comment text is required.");

    const result = await addCommentOp(
      model,
      normalizedId,
      currentUser,
      trimmedText,
      (doc, uid) => {
        const userId = uid.toString();
        if (doc[ownerField]?.toString() === userId) return true;
        if (doc.copiedTo?.some((c: any) => c.toString() === userId)) return true;
        if (doc.reviewedBy?.toString() === userId) return true;
        if (doc.approvedBy?.toString() === userId) return true;

        if (isMultiStep) {
          for (const step of reviewSteps) {
            if (doc[step.field]?.toString() === userId) return true;
          }
        }

        return currentUser.role === "SUPER-ADMIN";
      }
    );

    const transformed = transformDocument(result);
    return ResponseBuilder.operation(transformed, 'Comment added successfully');
  }

  async function updateComment(
    id: string,
    commentId: string,
    userId: mongoose.Types.ObjectId,
    text: string
  ) {
    const normalizedId = validateId(id, label);
    const trimmedText = text?.trim();
    if (!trimmedText) throw new Error("Comment text is required.");

    const result = await updateCommentOp(model, normalizedId, commentId, userId, trimmedText);
    const transformed = transformDocument(result);
    return ResponseBuilder.operation(transformed, 'Comment updated successfully');
  }

  async function deleteComment(
    id: string,
    commentId: string,
    currentUser: CurrentUser
  ) {
    const normalizedId = validateId(id, label);
    const result = await deleteCommentOp(model, normalizedId, commentId, currentUser);
    const transformed = transformDocument(result);
    return ResponseBuilder.operation(transformed, 'Comment deleted successfully');
  }

  // ─── Multi-Step Review Methods ──────────────────────────────────────────────

  async function updateReviewStep(
    id: string,
    step: string,
    reviewerId: string,
    currentUser: CurrentUser
  ) {
    if (!isMultiStep) {
      throw new Error(`Review steps are not configured for ${label}`);
    }

    const normalizedId = validateId(id, label);
    const doc = await model.findById(normalizedId);
    if (!doc) throw new Error(`${label} not found`);

    const stepConfig = reviewSteps.find(s => s.field === step);
    if (!stepConfig) {
      throw new Error(`Invalid review step: ${step}`);
    }

    doc[stepConfig.field] = reviewerId;
    doc[stepConfig.statusField] = 'approved';

    const newStatus = determineNextStatus(doc);
    doc.status = newStatus;

    await doc.save();

    if (newStatus === 'approved' && doc.approvedBy) {
      const approverId = (doc as any).approvedBy?.toString();
      const isCurrentUserApprover = approverId === currentUser._id.toString();
      if (!isCurrentUserApprover) {
        await notify.notifyApprovers({
          request: doc,
          currentUser,
          requestType,
          title: label,
          header: `All reviews are complete for this ${label}. Please approve.`,
        });
      }
    }

    const transformed = transformDocument(doc);
    return ResponseBuilder.operation(
      transformed,
      `${stepConfig.label} review completed successfully`
    );
  }

  async function getReviewStatus(id: string) {
    if (!isMultiStep) {
      throw new Error(`Review steps are not configured for ${label}`);
    }

    const normalizedId = validateId(id, label);
    const doc = await model.findById(normalizedId).populate(populate);
    if (!doc) throw new Error(`${label} not found`);

    const reviewStatus: Record<string, any> = {
      status: doc.status,
      steps: [],
    };

    for (const step of reviewSteps) {
      const reviewerId = doc[step.field];
      const statusValue = doc[step.statusField];

      let reviewer = null;
      if (reviewerId) {
        const populated = doc.populated(step.field);
        if (populated) {
          reviewer = doc[step.field];
        }
      }

      reviewStatus.steps.push({
        step: step.field,
        label: step.label,
        reviewer: reviewer ? {
          id: reviewer._id?.toString() || reviewerId?.toString(),
          name: reviewer?.fullName || reviewer?.firstName || reviewer?.email,
          email: reviewer?.email,
        } : null,
        status: statusValue || 'pending',
      });
    }

    return ResponseBuilder.single(reviewStatus, `${label} review status retrieved successfully`);
  }

  // ─── Build Return Object ──────────────────────────────────────────────────

  const service: WorkflowService<TDoc> = {
    copyService,
    getStats,
    getAll,
    getById,
    saveDraft,
    saveAndSubmit,
    update,
    updateStatus,
    remove,
    addComment,
    updateComment,
    deleteComment,
  };

  if (isMultiStep) {
    service.updateReviewStep = updateReviewStep;
    service.getReviewStatus = getReviewStatus;
  }

  return service;
}