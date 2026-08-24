// payment-voucher.service.ts - Fixed version with TypeScript fixes and no file logic
import type { PopulateOptions } from "mongoose";
import { PaymentVoucher, IPaymentVoucher } from "../models";
import { BaseCopyService } from "./base-copy.service";
import { notify } from "./notifications/notification.service";
import { cleanObjectId, parsePaginationParams, filterDeleted, transformDocument } from "./shared/helpers";
import { CurrentUser, BaseQueryParams, StatusUpdatePayload } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";

const POPULATE: PopulateOptions[] = [
  { path: "createdBy", select: "email firstName lastName role position signature" },
  { path: "reviewedBy", select: "email firstName lastName role position signature" },
  { path: "approvedBy", select: "email firstName lastName role position signature" },
  { path: "comments.user", select: "email firstName lastName role position" },
  { path: "copiedTo", select: "email firstName lastName role position" },
];

export const paymentVoucherCopyService = new BaseCopyService(PaymentVoucher, "PaymentVoucher");

// ─── Helper: Build structured filters (same as workflow factory) ──────────
interface FilterFieldConfig {
  key: string;
  type: "exact" | "regex" | "dateFrom" | "dateTo";
  field?: string;
}

const FILTERABLE_FIELDS: FilterFieldConfig[] = [
  { key: "status", type: "exact" },
  { key: "pvNumber", type: "regex" },
  { key: "payTo", type: "regex" },
  { key: "accountCode", type: "regex" },
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
        conditions[cfg.field ?? cfg.key] = value;
        break;
      case "regex": {
        const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        conditions[cfg.field ?? cfg.key] = new RegExp(escaped, "i");
        break;
      }
      case "dateFrom": {
        const date = new Date(value);
        if (!isNaN(date.getTime()) && cfg.field) {
          dateRanges[cfg.field] = { ...dateRanges[cfg.field], $gte: date };
        }
        break;
      }
      case "dateTo": {
        const date = new Date(value);
        if (!isNaN(date.getTime()) && cfg.field) {
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

// ─── Stats ────────────────────────────────────────────────────────────────────
export async function getPaymentVoucherStats(currentUser: CurrentUser): Promise<any> {
  const match: Record<string, unknown> = { status: { $ne: "draft" } };
  if (currentUser.role !== "SUPER-ADMIN") match.createdBy = currentUser._id;

  const [stats] = await PaymentVoucher.aggregate([
    { $match: match },
    {
      $facet: {
        totalVouchers: [{ $count: "count" }],
        totalApprovedVouchers: [{ $match: { status: "approved" } }, { $count: "count" }],
        totalPaidVouchers: [{ $match: { status: "paid" } }, { $count: "count" }],
        totalAmount: [
          { $match: { status: { $in: ["approved", "paid"] } } },
          { $group: { _id: null, total: { $sum: "$netAmount" } } },
        ],
      },
    },
  ]);

  return ResponseBuilder.stats(
    {
      totalVouchers: stats.totalVouchers[0]?.count ?? 0,
      totalApprovedVouchers: stats.totalApprovedVouchers[0]?.count ?? 0,
      totalPaidVouchers: stats.totalPaidVouchers[0]?.count ?? 0,
      totalAmount: stats.totalAmount[0]?.total ?? 0,
    },
    "Payment voucher statistics retrieved successfully"
  );
}

// ─── List ─────────────────────────────────────────────────────────────────────
export async function getPaymentVouchers(params: BaseQueryParams, currentUser: CurrentUser): Promise<any> {
  const { search, sort = "-createdAt", page, limit } = params;
  const { page: parsedPage, limit: parsedLimit, skip } = parsePaginationParams(page, limit);

  const query: Record<string, unknown> = {};
  
  // Free-text search
  if (search) {
    const re = new RegExp(search.trim().split(/\s+/).join("|"), "i");
    query.$or = [{ pvNumber: re }, { payTo: re }, { being: re }, { accountCode: re }, { status: re }];
  }

  // Structured filters
  const filterParams: Record<string, unknown> = { ...params };
  Object.assign(query, buildStructuredFilters(filterParams));

  // Role-based visibility
  switch (currentUser.role) {
    case "STAFF":
      query.createdBy = currentUser._id;
      break;
    case "ADMIN":
      query.$or = [{ createdBy: currentUser._id }, { approvedBy: currentUser._id }];
      break;
    case "REVIEWER":
      query.$or = [{ createdBy: currentUser._id }, { reviewedBy: currentUser._id }];
      break;
    case "SUPER-ADMIN":
      query.$or = [{ status: { $ne: "draft" } }, { createdBy: currentUser._id, status: "draft" }];
      break;
    default:
      throw new Error("Invalid user role");
  }

  const [items, total] = await Promise.all([
    PaymentVoucher.find(query)
      .populate(POPULATE)
      .sort(sort)
      .skip(skip)
      .limit(parsedLimit),
    PaymentVoucher.countDocuments(query),
  ]);

  // Transform each document (converts _id to id, removes __v, filters comments)
  const transformedItems = items.map((doc) => {
    // Filter deleted comments before transform
    if (doc.comments) {
      // Type assertion: filterDeleted expects array with deleted property
      doc.comments = filterDeleted(doc.comments as any[]) as any;
    }
    return transformDocument(doc);
  });

  const pagination = ResponseBuilder.getPaginationMeta(parsedPage, parsedLimit, total);
  return ResponseBuilder.list(transformedItems, pagination, "Payment vouchers retrieved successfully");
}

// ─── Get by ID ────────────────────────────────────────────────────────────────
export async function getPaymentVoucherById(id: string): Promise<any> {
  const cleanId = cleanObjectId(id);
  const doc = await PaymentVoucher.findById(cleanId).populate(POPULATE);
  if (!doc) throw new Error("Payment Voucher not found");
  
  // Filter deleted comments
  if (doc.comments) {
    doc.comments = filterDeleted(doc.comments as any[]) as any;
  }
  
  const transformed = transformDocument(doc);
  return ResponseBuilder.single(transformed, "Payment voucher retrieved successfully");
}

// ─── Save draft ───────────────────────────────────────────────────────────────
export async function savePaymentVoucherDraft(data: Partial<IPaymentVoucher>, currentUser: CurrentUser): Promise<any> {
  const doc = new PaymentVoucher({
    ...data,
    status: "draft",
    createdBy: currentUser._id,
    comments: [],
  });
  await doc.save();
  
  const transformed = transformDocument(doc);
  return ResponseBuilder.operation(transformed, "Payment voucher draft saved successfully");
}

// ─── Save & submit ────────────────────────────────────────────────────────────
export async function submitPaymentVoucher(
  data: Partial<IPaymentVoucher>,
  currentUser: CurrentUser
): Promise<any> {
  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }

  if (data.pvDate) {
    data.pvDate = new Date(data.pvDate as any).toISOString().split("T")[0];
  }

  const doc = new PaymentVoucher({
    ...data,
    status: "pending",
    createdBy: currentUser._id,
  });
  await doc.save();

  notify
    .notifyReviewers({
      request: doc,
      currentUser,
      requestType: "paymentVoucher",
      title: "Payment Voucher",
      header: "You have been assigned a payment voucher for review",
    })
    .catch(console.error);

  const transformed = transformDocument(doc);
  return ResponseBuilder.operation(transformed, "Payment voucher submitted successfully");
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updatePaymentVoucher(
  id: string,
  data: Partial<IPaymentVoucher>,
  currentUser: CurrentUser
): Promise<any> {
  const cleanId = cleanObjectId(id);

  if (data.pvDate) {
    data.pvDate = new Date(data.pvDate as any).toISOString().split("T")[0];
  }

  const doc = await PaymentVoucher.findByIdAndUpdate(cleanId, data, {
    new: true,
    runValidators: true,
  });
  if (!doc) throw new Error("Payment Voucher not found");

  if (doc.status === "reviewed") {
    notify
      .notifyApprovers({
        request: doc,
        currentUser,
        requestType: "paymentVoucher",
        title: "Payment Voucher",
        header: "You have been assigned a payment voucher for approval",
      })
      .catch(console.error);
  }

  const transformed = transformDocument(doc);
  return ResponseBuilder.operation(transformed, "Payment voucher updated successfully");
}

// ─── Status update ────────────────────────────────────────────────────────────
export async function updateVoucherStatus(
  id: string,
  data: StatusUpdatePayload & { status: string; comment?: string },
  currentUser: CurrentUser
): Promise<any> {
  const cleanId = cleanObjectId(id);
  const doc = await PaymentVoucher.findById(cleanId);
  if (!doc) throw new Error("Payment Voucher not found");

  if (data.comment) {
    if (!doc.comments) {
      doc.comments = [] as any;
    }
    // Type assertion for the comments array
    const comments = doc.comments as any[];
    comments.unshift({
      user: currentUser._id,
      text: data.comment,
      edited: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  doc.status = data.status as any;
  const updated = await doc.save();

  notify
    .notifyCreator({
      request: updated,
      currentUser,
      requestType: "paymentVoucher",
      title: "Payment Voucher",
      header: `Your payment voucher status has been updated to ${data.status}`,
    })
    .catch(console.error);

  const transformed = transformDocument(updated);
  return ResponseBuilder.operation(transformed, `Payment voucher status updated to ${data.status}`);
}

// ─── Delete ───────────────────────────────────────────────────────────────────
export async function deletePaymentVoucher(id: string): Promise<any> {
  const cleanId = cleanObjectId(id);
  const doc = await PaymentVoucher.findByIdAndDelete(cleanId);
  if (!doc) throw new Error("Payment Voucher not found");
  
  const transformed = transformDocument(doc);
  return ResponseBuilder.operation(transformed, "Payment voucher deleted successfully");
}

// ─── Backward compatibility ──────────────────────────────────────────────────
export const savePaymentVoucher = savePaymentVoucherDraft;
export const saveAndSendPaymentVoucher = submitPaymentVoucher;