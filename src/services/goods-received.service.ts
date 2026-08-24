// goods-received.service.ts - With TypeScript fixes
import { GoodsReceived, IGRNItem, PurchaseOrder } from "../models";
import { fileService } from "./file.service";
import { CurrentUser, BaseQueryParams } from "./shared/types";
import { cleanObjectId, parsePaginationParams, transformDocument } from "./shared/helpers";
import { GOODS_RECEIVED_POPULATE } from "./shared/procurement.helpers";
import { ResponseBuilder } from "./shared/response-builder";
import mongoose from "mongoose";

const POPULATE = GOODS_RECEIVED_POPULATE;

// ─── Filter field configuration (uniform with workflow factory) ──────────
interface FilterFieldConfig {
  key: string;
  type: "exact" | "regex" | "dateFrom" | "dateTo";
  field?: string;
}

const FILTERABLE_FIELDS: FilterFieldConfig[] = [
  { key: "status", type: "exact" },
  { key: "grdCode", type: "regex" },
  { key: "dateFrom", type: "dateFrom", field: "createdAt" },
  { key: "dateTo", type: "dateTo", field: "createdAt" },
];

function buildStructuredFilters(params: Record<string, unknown>): Record<string, unknown> {
  const conditions: Record<string, unknown> = {};
  const dateRanges: Record<string, { $gte?: Date; $lte?: Date }> = {};

  for (const cfg of FILTERABLE_FIELDS) {
    const raw = params[cfg.key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = String(raw).trim();
    if (value === "") continue;

    switch (cfg.type) {
      case "exact":
        // Fix: Use cfg.field ?? cfg.key with proper fallback
        conditions[cfg.field ?? cfg.key] = value;
        break;
      case "regex": {
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        // Fix: Use cfg.field ?? cfg.key with proper fallback
        conditions[cfg.field ?? cfg.key] = new RegExp(escaped, "i");
        break;
      }
      case "dateFrom": {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          // Fix: Ensure cfg.field is defined for date ranges
          if (cfg.field) {
            dateRanges[cfg.field] = { ...dateRanges[cfg.field], $gte: date };
          }
        }
        break;
      }
      case "dateTo": {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          date.setHours(23, 59, 59, 999);
          // Fix: Ensure cfg.field is defined for date ranges
          if (cfg.field) {
            dateRanges[cfg.field] = { ...dateRanges[cfg.field], $lte: date };
          }
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

// ─── Helper: transform item with files ────────────────────────────────────
function transformWithFiles(doc: any, files: any[] = []) {
  const transformed = transformDocument(doc);
  // Only include files if they exist
  if (files && files.length > 0) {
    return { ...transformed, files };
  }
  return transformed;
}

// ─── Item calculation helpers ─────────────────────────────────────────────────
function computeItem(item: { itemId: string; numberOrdered: number; numberReceived: number }): IGRNItem {
  const received = Math.min(item.numberReceived, item.numberOrdered);
  const difference = item.numberOrdered - received;
  return {
    itemId: item.itemId,
    numberOrdered: item.numberOrdered,
    numberReceived: received,
    difference,
    isFullyReceived: difference === 0,
  };
}

function allFullyReceived(items: IGRNItem[]): boolean {
  return items.length > 0 && items.every((i) => i.isFullyReceived);
}

function validateItemIds(items: { itemId: string }[], po: any): void {
  const validIds = new Set(po.itemGroups.map((g: any) => (g._id ?? g.id).toString()));
  const invalid = items.filter((i) => !validIds.has(i.itemId));
  if (invalid.length) {
    throw new Error(`Invalid item IDs: ${invalid.map((i) => i.itemId).join(", ")}`);
  }
}

// ─── Create or update GRN ─────────────────────────────────────────────────────
export async function createOrUpdateGoodsReceived(
  data: { purchaseOrder: string; grnItems: { itemId: string; numberOrdered: number; numberReceived: number }[] },
  currentUser: CurrentUser,
  files: Express.Multer.File[] = []
): Promise<any> {
  const po = await PurchaseOrder.findById(data.purchaseOrder);
  if (!po) throw new Error("Purchase Order not found");

  validateItemIds(data.grnItems, po);

  const existing = await GoodsReceived.findOne({ purchaseOrder: data.purchaseOrder });
  let grn: any;
  let isNew = false;

  if (existing) {
    if (existing.isCompleted) {
      throw new Error("Cannot update GRN — all items are already fully received.");
    }

    const existingMap = new Map(existing.grnItems.map((i: any) => [i.itemId, i]));
    existing.grnItems = data.grnItems.map((newItem) => {
      const old = existingMap.get(newItem.itemId);
      if (old?.isFullyReceived) return old;
      return computeItem(newItem);
    });
    existing.isCompleted = allFullyReceived(existing.grnItems);
    await existing.save();
    grn = existing;
  } else {
    isNew = true;
    const computedItems = data.grnItems.map(computeItem);
    grn = new GoodsReceived({
      purchaseOrder: data.purchaseOrder,
      grnItems: computedItems,
      isCompleted: allFullyReceived(computedItems),
      createdBy: currentUser._id,
    });
    await grn.save();
  }

  if (files.length) {
    await fileService.handleFileUploads(files, grn._id.toString(), "GoodsReceived");
  }

  const filesData = await fileService.getFilesByModel("GoodsReceived", grn._id.toString());
  const populated = await grn.populate(POPULATE);

  // Transform and only include files if they exist
  const transformed = transformWithFiles(populated, filesData);

  return ResponseBuilder.operation(
    transformed,
    isNew ? "Goods Received Note created successfully" : "Goods Received Note updated successfully"
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────
export async function getGoodsReceivedNotes(
  params: BaseQueryParams,
  currentUser: CurrentUser
): Promise<any> {
  const { search, sort = "-createdAt", page, limit } = params;
  const { page: parsedPage, limit: parsedLimit, skip } = parsePaginationParams(page, limit);

  const query: Record<string, unknown> = {};

  // Free-text search
  if (search) {
    const re = new RegExp(search.trim(), "i");
    query.$or = [{ grdCode: re }];
  }

  // Structured filters (uniform with workflow factory)
  // Fix: Convert params to Record<string, unknown> by spreading
  const filterParams: Record<string, unknown> = { ...params };
  Object.assign(query, buildStructuredFilters(filterParams));

  // Role-based visibility
  if (!["ADMIN", "SUPER-ADMIN"].includes(currentUser.role)) {
    query.createdBy = currentUser._id;
  }

  const [items, total] = await Promise.all([
    GoodsReceived.find(query)
      .populate(POPULATE)
      .sort(sort)
      .skip(skip)
      .limit(parsedLimit),
    GoodsReceived.countDocuments(query),
  ]);

  // Get files in batch
  const filesByDoc = await fileService.getFilesByModelBatch(
    "GoodsReceived",
    items.map((grn) => String(grn._id))
  );

  // Transform each document with its files (only include if files exist)
  const withFiles = items.map((grn) => {
    const files = filesByDoc.get(String(grn._id)) ?? [];
    return transformWithFiles(grn, files);
  });

  const pagination = ResponseBuilder.getPaginationMeta(parsedPage, parsedLimit, total);
  return ResponseBuilder.list(withFiles, pagination, "Goods Received Notes retrieved successfully");
}

// ─── Get by ID ────────────────────────────────────────────────────────────────
export async function getGoodsReceivedById(id: string): Promise<any> {
  const cleanId = cleanObjectId(id);
  const grn = await GoodsReceived.findById(cleanId).populate(POPULATE);
  if (!grn) throw new Error("Goods Received Note not found");

  const files = await fileService.getFilesByModel("GoodsReceived", cleanId);
  const transformed = transformWithFiles(grn, files);

  return ResponseBuilder.single(transformed, "Goods Received Note retrieved successfully");
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateGoodsReceived(
  id: string,
  data: { grnItems?: any[]; [key: string]: any },
  currentUser: CurrentUser,
  files: Express.Multer.File[] = []
): Promise<any> {
  const cleanId = cleanObjectId(id);
  const grn = await GoodsReceived.findById(cleanId);
  if (!grn) throw new Error("Goods Received Note not found");
  if (grn.isCompleted) {
    throw new Error("Cannot update GRN — all items are fully received.");
  }

  const update: Record<string, any> = { ...data };

  if (data.grnItems?.length) {
    const po = await PurchaseOrder.findById(grn.purchaseOrder);
    if (!po) throw new Error("Purchase Order not found");

    validateItemIds(data.grnItems, po);
    const existingMap = new Map(grn.grnItems.map((i: any) => [i.itemId, i]));

    update.grnItems = data.grnItems.map((newItem: any) => {
      const old = existingMap.get(newItem.itemId);
      if (old?.isFullyReceived) return old;
      return computeItem(newItem);
    });
    update.isCompleted = allFullyReceived(update.grnItems);
  }

  const updated = await GoodsReceived.findByIdAndUpdate(cleanId, update, {
    new: true,
    runValidators: true,
  });
  if (!updated) throw new Error("Goods Received Note not found");

  if (files.length) {
    await fileService.deleteFilesByModel("GoodsReceived", cleanId);
    await fileService.handleFileUploads(files, String(updated._id), "GoodsReceived");
  }

  await updated.populate(POPULATE);
  const filesData = await fileService.getFilesByModel("GoodsReceived", String(updated._id));

  const transformed = transformWithFiles(updated, filesData);

  return ResponseBuilder.operation(
    transformed,
    "Goods Received Note updated successfully"
  );
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deleteGoodsReceived(id: string): Promise<any> {
  const cleanId = cleanObjectId(id);
  await fileService.deleteFilesByModel("GoodsReceived", cleanId);
  const grn = await GoodsReceived.findByIdAndDelete(cleanId);
  if (!grn) throw new Error("Goods Received Note not found");

  const transformed = transformDocument(grn);
  return ResponseBuilder.operation(transformed, "Goods Received Note deleted successfully");
}

// ─── By PO ────────────────────────────────────────────────────────────────────
export async function getGoodsReceivedByPurchaseOrder(purchaseOrderId: string): Promise<any> {
  const cleanId = cleanObjectId(purchaseOrderId);
  const items = await GoodsReceived.find({ purchaseOrder: cleanId })
    .populate(POPULATE)
    .sort("-createdAt");

  // Transform items and include files only if they exist
  const transformedItems = await Promise.all(
    items.map(async (grn) => {
      const files = await fileService.getFilesByModel("GoodsReceived", String(grn._id));
      return transformWithFiles(grn, files);
    })
  );

  return ResponseBuilder.list(
    transformedItems,
    { page: 1, limit: items.length, total: items.length, pages: 1 },
    "Goods Received Notes retrieved successfully"
  );
}

// ─── Check if GRN exists ──────────────────────────────────────────────────────
export async function checkGRNExists(purchaseOrderId: string): Promise<any> {
  const cleanId = cleanObjectId(purchaseOrderId);
  const grn = await GoodsReceived.findOne({ purchaseOrder: cleanId });

  // This is a simple check, no need to transform the full document
  const data = {
    exists: !!grn,
    isCompleted: grn?.isCompleted ?? false,
  };

  // If GRN exists, include basic info without heavy transformation
  if (grn) {
    const transformed = transformDocument(grn);
    return ResponseBuilder.single(
      { ...data, grn: transformed },
      "GRN check completed"
    );
  }

  return ResponseBuilder.single(data, "GRN check completed");
}

// ─── Summary aggregate ────────────────────────────────────────────────────────
export async function getGoodsReceivedSummary(purchaseOrderId?: string): Promise<any> {
  const match = purchaseOrderId
    ? { purchaseOrder: new mongoose.Types.ObjectId(cleanObjectId(purchaseOrderId)) }
    : {};

  const [summary] = await GoodsReceived.aggregate([
    { $match: match },
    { $unwind: "$grnItems" },
    {
      $group: {
        _id: null,
        totalItemsOrdered: { $sum: "$grnItems.numberOrdered" },
        totalItemsReceived: { $sum: "$grnItems.numberReceived" },
        totalDifferences: { $sum: "$grnItems.difference" },
        fullyReceivedItems: { $sum: { $cond: ["$grnItems.isFullyReceived", 1, 0] } },
        averageReceiptRate: {
          $avg: { $divide: ["$grnItems.numberReceived", "$grnItems.numberOrdered"] },
        },
      },
    },
  ]);

  return ResponseBuilder.single(
    {
      summary: summary ?? {
        totalItemsOrdered: 0,
        totalItemsReceived: 0,
        totalDifferences: 0,
        fullyReceivedItems: 0,
        averageReceiptRate: 0,
      },
    },
    "GRN summary retrieved successfully"
  );
}

// ─── Add files to GRN ────────────────────────────────────────────────────────
export async function addFilesToGoodsReceived(
  id: string,
  files: Express.Multer.File[] = [],
  _currentUser: CurrentUser
): Promise<any> {
  const cleanId = cleanObjectId(id);
  const grn = await GoodsReceived.findById(cleanId);
  if (!grn) throw new Error("Goods Received Note not found");

  if (files.length) {
    await fileService.handleFileUploads(files, cleanId, "GoodsReceived");
  }

  const fileData = await fileService.getFilesByModel("GoodsReceived", cleanId);
  const transformed = transformWithFiles(grn, fileData);

  return ResponseBuilder.operation(
    transformed,
    "Files added to GRN"
  );
}

// ─── Backward compatibility ──────────────────────────────────────────────────
export const createGoodsReceived = createOrUpdateGoodsReceived;