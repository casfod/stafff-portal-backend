// src/services/document-ownership.service.ts
//
// Two centralized checks used by the file controller:
//   - assertCanManageDocumentFiles: only the creator of a document (or an
//     admin) may add/delete its attachments.
//   - assertCanAccessDocumentFiles: anyone with legitimate access to a
//     document (creator, reviewer, approver, cc'd user, admin, or a fully
//     open model) may view/download its attachments.
//
// A File's `associatedTo.model` can point at many different collections
// (Projects, AdvanceRequest, PurchaseRequest, ...). Since each of those
// workflow models may store its "creator" under a different field name,
// this map lets us look that field up generically instead of hardcoding
// checks per-route.

import mongoose from 'mongoose';
import { AppError } from '../utils/AppError';

// Minimal shape we need from the authenticated user — adjust the import
// path/type to match your actual CurrentUser/AuthRequest['user'] type.
export interface OwnershipCheckUser {
  _id: mongoose.Types.ObjectId | string;
  role: string;
}

// Extend this whenever a new workflow model gets file attachments.
// Defaults to "createdBy" (see ownerField default in workflow-service.factory.ts)
// if a model isn't listed here.
const OWNER_FIELD_BY_MODEL: Record<string, string> = {
  AdvanceRequest: 'createdBy',
  PurchaseRequest: 'createdBy',
  ExpenseRequest: 'createdBy',
  TravelRequest: 'createdBy',
  PaymentRequest: 'createdBy',
};

// Models with no per-user "creator" at all — e.g. Projects has no
// `createdBy` field (see IProject in interfaces.ts) because only
// SUPER-ADMIN ever creates one (see the role check in AllProjects.tsx).
// For these, "manage" simply means "is an admin", not "matches a field".
const ADMIN_ONLY_MODELS = new Set<string>(['Projects']);

// Roles that can manage attachments on any document, regardless of ownership.
const BYPASS_ROLES = new Set(['SUPER-ADMIN']);

/**
 * Throws a 403 AppError unless `currentUser` is the creator of
 * `documentId` (in collection `modelName`) or holds a bypass role.
 * Use this to gate add/delete of attachments — always creator-only,
 * except for admin-only models (see ADMIN_ONLY_MODELS).
 */
export async function assertCanManageDocumentFiles(
  modelName: string,
  documentId: string,
  currentUser: OwnershipCheckUser,
): Promise<void> {
  if (!modelName || !documentId) {
    // No association given — nothing to check against. Callers should
    // decide whether an unassociated upload is allowed at all.
    return;
  }

  if (BYPASS_ROLES.has(currentUser.role)) return;

  if (ADMIN_ONLY_MODELS.has(modelName)) {
    throw new AppError(
      'Only an administrator can manage attachments for this document type',
      403,
    );
  }

  const Model = mongoose.models[modelName];
  if (!Model) {
    throw new AppError(`Unknown document type '${modelName}'`, 400);
  }

  const ownerField = OWNER_FIELD_BY_MODEL[modelName] ?? 'createdBy';

  const doc = await Model.findById(documentId).select(ownerField).lean();
  if (!doc) {
    throw new AppError(`${modelName} not found`, 404);
  }

  const rawOwnerId = (doc as Record<string, unknown>)[ownerField];
  const ownerId = rawOwnerId != null ? String(rawOwnerId) : undefined;
  const requesterId = currentUser._id?.toString();

  if (!ownerId || ownerId !== requesterId) {
    throw new AppError(
      'Only the creator of this document can manage its attachments',
      403,
    );
  }
}

// Models where every authenticated user is allowed to view/download
// attachments (e.g. Projects is visible to the whole org). Add/remove
// model names here as your visibility rules evolve.
const OPEN_ACCESS_MODELS = new Set<string>(['Projects']);

/**
 * Throws a 403 AppError unless `currentUser` has read access to
 * `documentId` (in collection `modelName`) — i.e. is its creator,
 * its assigned reviewer/approver, someone it was copied to, holds a
 * bypass role, or the model is fully open (see OPEN_ACCESS_MODELS).
 *
 * Use this to gate downloads/list views. Use assertCanManageDocumentFiles
 * (above) to gate add/delete, which is always creator-only.
 */
export async function assertCanAccessDocumentFiles(
  modelName: string,
  documentId: string,
  currentUser: OwnershipCheckUser,
): Promise<void> {
  if (!modelName || !documentId) return;
  if (BYPASS_ROLES.has(currentUser.role)) return;
  if (OPEN_ACCESS_MODELS.has(modelName)) return;

  const Model = mongoose.models[modelName];
  if (!Model) {
    throw new AppError(`Unknown document type '${modelName}'`, 400);
  }

  const doc = await Model.findById(documentId)
    .select('createdBy reviewedBy approvedBy copiedTo')
    .lean();
  if (!doc) {
    throw new AppError(`${modelName} not found`, 404);
  }

  const record = doc as Record<string, unknown>;
  const requesterId = currentUser._id?.toString();

  const rawParticipants: unknown[] = [
    record.createdBy,
    record.reviewedBy,
    record.approvedBy,
    ...(Array.isArray(record.copiedTo) ? record.copiedTo : []),
  ];

  const participantIds: string[] = rawParticipants
    .filter((v): v is NonNullable<typeof v> => v != null)
    .map((v) => String(v));

  if (!requesterId || !participantIds.includes(requesterId)) {
    throw new AppError('You do not have access to this document', 403);
  }
}