// src/services/shared/procurement.helpers.ts
//
// Small shared utilities for the procurement domain (RFQ, PurchaseOrder,
// GoodsReceived). These are deliberately NOT a workflow factory — PO's
// dual creation paths, GRN's item-received math, and RFQ's draft/sent
// lifecycle diverge too much to templatize without the abstraction costing
// more readability than it saves. What they *do* share is: item-group
// totals math, creator/approver notification fan-out, and populate shape.
// Pulling just those three things out here keeps each service's
// domain-specific logic front and center while removing the duplication.

import type { PopulateOptions } from "mongoose";
import { notify } from "../notifications/notification.service";
import { CurrentUser } from "./types";

// ─── Item-group totals validation ─────────────────────────────────────────────
// Shared by PurchaseOrder.itemGroups and RFQ.itemGroups — both use the same
// { description/itemName, frequency, quantity, unit, unitCost, total } shape.
export interface RawItemGroup {
  description?: string;
  itemName?: string;
  frequency?: number;
  quantity: number;
  unit?: string;
  unitCost?: number;
}

// Explicitly required (not spread from RawItemGroup) so this matches
// IPOItemGroup's required frequency/unit/unitCost/total — a plain
// `{ ...item, total }` spread would leave those typed as optional and
// fail assignment to PurchaseOrder.itemGroups.
export interface ValidatedItemGroup {
  description?: string;
  itemName?: string;
  frequency: number;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

/**
 * Validates each item has a positive unit cost and computes `total` as
 * quantity * unitCost * frequency. Throws with the offending item's name
 * if validation fails. Defaults frequency to 1 and unit to '' when omitted.
 */
export function validateAndTotalItems(items: RawItemGroup[]): ValidatedItemGroup[] {
  return items.map((item) => {
    if (!item.unitCost || item.unitCost <= 0) {
      throw new Error(`Unit cost must be > 0 for item: ${item.itemName ?? item.description}`);
    }
    const frequency = item.frequency ?? 1;
    return {
      description: item.description,
      itemName: item.itemName,
      frequency,
      quantity: item.quantity,
      unit: item.unit ?? "",
      unitCost: item.unitCost,
      total: item.quantity * item.unitCost * frequency,
    };
  });
}

/** Sums the `total` field across a list of already-validated item groups. */
export function sumItemTotals(items: ValidatedItemGroup[]): number {
  return items.reduce((sum, i) => sum + i.total, 0);
}

// ─── Status-change notifications ──────────────────────────────────────────────
// Shared creator/approver notification fan-out used by PO, RFQ, and Vendor
// status transitions. Domain-specific side effects (vendor emails, PDF
// attachments) stay in the calling service — this only handles the
// in-app notification fan-out that was previously duplicated inline.
export interface NotifyStatusChangeOptions {
  request: any;
  currentUser: CurrentUser;
  requestType: string;
  title: string;
  status: string;
  /** Skip the "assigned to you" approver notification (e.g. on final approval). */
  notifyApproversUnless?: string[];
  /** Override the default "Your {title} is {status}" creator-notification copy. */
  creatorHeader?: string;
  /** Override the default "You have been assigned a {title}" approver-notification copy. */
  approverHeader?: string;
}

export async function notifyStatusChange({
  request,
  currentUser,
  requestType,
  title,
  status,
  notifyApproversUnless = ["approved"],
  creatorHeader,
  approverHeader,
}: NotifyStatusChangeOptions): Promise<void> {
  const base = { request, currentUser, requestType, title };

  notify
    .notifyCreator({ ...base, header: creatorHeader ?? `Your ${title} is ${status}` })
    .catch(console.error);

  if (!notifyApproversUnless.includes(status)) {
    notify
      .notifyApprovers({ ...base, header: approverHeader ?? `You have been assigned a ${title}` })
      .catch(console.error);
  }
}

// ─── Shared populate shapes ────────────────────────────────────────────────────
export const USER_SELECT = "email firstName lastName role signature";
export const VENDOR_SELECT = "businessName email contactPerson businessPhoneNumber address";

/** createdBy + approvedBy, both selected down to USER_SELECT. Used by PO, RFQ, Vendor. */
export const CREATOR_APPROVER_POPULATE: PopulateOptions[] = [
  { path: "createdBy", select: USER_SELECT },
  { path: "approvedBy", select: USER_SELECT },
];

/** copiedTo + selectedVendor, both selected down to VENDOR_SELECT. Used by PO, RFQ. */
export const VENDOR_REF_POPULATE: PopulateOptions[] = [
  { path: "copiedTo", select: VENDOR_SELECT },
  { path: "selectedVendor", select: VENDOR_SELECT },
];

/** Full populate set for PurchaseOrder — composes the two above + comments. */
export const PURCHASE_ORDER_POPULATE: PopulateOptions[] = [
  ...CREATOR_APPROVER_POPULATE,
  ...VENDOR_REF_POPULATE,
  { path: "comments.user", select: USER_SELECT },
];

/** Full populate set for GoodsReceived — nests PO's own vendor/creator refs. */
export const GOODS_RECEIVED_POPULATE: PopulateOptions[] = [
  {
    path: "purchaseOrder",
    populate: [
      { path: "selectedVendor", select: VENDOR_SELECT },
      { path: "createdBy", select: USER_SELECT },
    ],
  },
  { path: "createdBy", select: USER_SELECT },
];