/**
 * migrate-files-schema.ts
 *
 * Migrates the legacy `files` collection (+ merges in `fileassociations`,
 * which is being retired) into the new single-collection File schema
 * defined in File.model.ts.
 *
 * WHAT IT DOES
 *
 * A) Derives new required fields that don't exist on old `files` docs:
 *      publicId     <- cloudinaryId (same value; new docs use publicId as
 *                       primary, cloudinaryId as a mirrored legacy field —
 *                       old docs only ever had cloudinaryId)
 *      originalName <- name
 *      format       <- file extension parsed from name/originalName,
 *                       falling back to a mimeType -> extension lookup
 *      resourceType <- parsed from the Cloudinary URL's path segment
 *                       (".../res.cloudinary.com/<cloud>/<resourceType>/upload/...")
 *      folder       <- the directory portion of cloudinaryId
 *                       (e.g. "pdfs/xyz-123" -> "pdfs")
 *    None of these are guessed blindly: if a value can't be confidently
 *    derived, the document is NOT force-updated for that field — it's
 *    listed in `summary.manualReviewNeeded` with the specific field(s)
 *    that need a human decision, since these are all `required` in the
 *    new schema and a bad guess is worse than a flagged gap.
 *
 * B) Merges `fileassociations` into each file's `associatedTo` field:
 *      - Exactly one association for a file -> becomes
 *        `associatedTo: { model, id: documentId }`. The association's
 *        `fieldName` (e.g. "avatar" vs "signature") has no home in the
 *        new shape and is dropped — logged in `summary.droppedFieldNames`
 *        so you know what was lost.
 *      - Zero associations -> `associatedTo` left unset (an unassociated/
 *        orphaned upload, which the new schema allows since the field is
 *        optional).
 *      - More than one association for the same file -> NOT auto-merged.
 *        Logged in `summary.multipleAssociations` with all of them, for
 *        you to decide (duplicate the File doc per association? keep the
 *        most recent? something else?) — auto-picking one would silently
 *        lose a real reference somewhere in the app.
 *      - Associations whose `file` id doesn't match any document in
 *        `files` -> logged in `summary.orphanedAssociations`.
 *
 * C) `publicId` is `unique` in the new schema. Since we're deriving it
 *    from existing `cloudinaryId` values rather than generating anything
 *    new, this migration can't introduce fresh duplicates — but if
 *    duplicate cloudinaryIds already exist in your data, the unique index
 *    build will fail. Call `findDuplicatePublicIds()` (exported below) to
 *    check before you rely on that index.
 *
 * IMPORTANT: this script does NOT drop or modify the `fileassociations`
 * collection. Once you've verified the merge with a dry run and a real
 * run, dropping `fileassociations` is a separate, deliberate step you
 * should take manually after confirming nothing else in the app still
 * reads from it directly.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collections (mongoose.connection.db).
 *
 * USAGE
 *   import { migrateFiles, findDuplicatePublicIds } from './migrate-files-schema';
 *   await migrateFiles({ dryRun: true });   // inspect first
 *   await migrateFiles({ dryRun: false });  // then apply
 *   await findDuplicatePublicIds();         // before trusting the unique index
 */

import mongoose from 'mongoose';
import { env } from '../config/env';

interface MigrationOptions {
  dryRun?: boolean;
  batchSize?: number;
}

interface ManualReviewEntry {
  _id: unknown;
  missingFields: string[];
}

interface MultipleAssociationEntry {
  fileId: unknown;
  associations: { model: string; id: unknown; fieldName: unknown }[];
}

interface DroppedFieldNameEntry {
  fileId: unknown;
  associationId: unknown;
  fieldName: unknown;
}

interface MigrationSummary {
  scanned: number;
  matched: number;
  modified: number;
  skipped: number;
  errors: { _id: unknown; error: string }[];
  manualReviewNeeded: ManualReviewEntry[];
  multipleAssociations: MultipleAssociationEntry[];
  droppedFieldNames: DroppedFieldNameEntry[];
  orphanedAssociations: unknown[]; // fileassociation _ids pointing at a nonexistent file
}

const MIME_TO_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.ms-powerpoint': 'ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/csv': 'csv',
  'text/plain': 'txt',
  'application/zip': 'zip',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
};

function deriveFormat(doc: Record<string, any>): string | null {
  const nameVal = doc.originalName || doc.name;
  if (typeof nameVal === 'string') {
    const match = nameVal.match(/\.([a-zA-Z0-9]+)$/);
    if (match) return match[1].toLowerCase();
  }
  if (typeof doc.mimeType === 'string' && MIME_TO_EXT[doc.mimeType]) {
    return MIME_TO_EXT[doc.mimeType];
  }
  return null;
}

function deriveResourceType(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  const match = url.match(/res\.cloudinary\.com\/[^/]+\/([^/]+)\//);
  return match ? match[1] : null;
}

function deriveFolder(cloudinaryId: unknown): string | null {
  if (typeof cloudinaryId !== 'string') return null;
  const idx = cloudinaryId.lastIndexOf('/');
  if (idx === -1) return null; // no folder segment present
  return cloudinaryId.substring(0, idx);
}

async function loadAssociationsByFile(db: any): Promise<Map<string, any[]>> {
  const assocCollection = db.collection('fileassociations');
  const cursor = assocCollection.find({});
  const map = new Map<string, any[]>();
  for await (const assoc of cursor) {
    const key = String(assoc.file);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(assoc);
  }
  return map;
}

function buildUpdateForDoc(
  doc: Record<string, any>,
  associations: any[],
  summary: MigrationSummary,
): { $set?: Record<string, any> } | null {
  const $set: Record<string, any> = {};
  const missingFields: string[] = [];

  // A) Derive required fields
  if (doc.publicId === undefined) {
    if (doc.cloudinaryId) $set.publicId = doc.cloudinaryId;
    else missingFields.push('publicId (no cloudinaryId to derive from)');
  }

  if (doc.originalName === undefined) {
    if (doc.name) $set.originalName = doc.name;
    else missingFields.push('originalName (no legacy name field)');
  }

  if (doc.format === undefined) {
    const derived = deriveFormat(doc);
    if (derived) $set.format = derived;
    else missingFields.push('format (could not derive from name or mimeType)');
  }

  if (doc.resourceType === undefined) {
    const derived = deriveResourceType(doc.url);
    if (derived) $set.resourceType = derived;
    else missingFields.push('resourceType (could not parse from url)');
  }

  if (doc.folder === undefined) {
    const derived = deriveFolder(doc.cloudinaryId);
    if (derived) $set.folder = derived;
    else missingFields.push('folder (could not derive from cloudinaryId path)');
  }

  if (missingFields.length) {
    summary.manualReviewNeeded.push({ _id: doc._id, missingFields });
  }

  // B) Merge fileassociations -> associatedTo
  if (doc.associatedTo === undefined) {
    if (associations.length === 1) {
      const assoc = associations[0];
      $set.associatedTo = { model: assoc.model, id: assoc.documentId };
      if (assoc.fieldName !== undefined && assoc.fieldName !== null) {
        summary.droppedFieldNames.push({
          fileId: doc._id,
          associationId: assoc._id,
          fieldName: assoc.fieldName,
        });
      }
    } else if (associations.length > 1) {
      summary.multipleAssociations.push({
        fileId: doc._id,
        associations: associations.map((a) => ({ model: a.model, id: a.documentId, fieldName: a.fieldName })),
      });
    }
    // associations.length === 0 -> leave associatedTo unset, nothing to do
  }

  if (Object.keys($set).length === 0) return null;
  return { $set };
}

export async function migrateFiles(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const filesCollection = db.collection('files');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    manualReviewNeeded: [],
    multipleAssociations: [],
    droppedFieldNames: [],
    orphanedAssociations: [],
  };

  const associationsByFile = await loadAssociationsByFile(db);
  const visitedFileIds = new Set<string>();

  const cursor = filesCollection.find({});
  let batch: { updateOne: { filter: { _id: any }; update: any } }[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;
    if (dryRun) {
      summary.modified += batch.length;
      batch = [];
      return;
    }
    try {
      const result = await filesCollection.bulkWrite(batch, { ordered: false });
      summary.modified += result.modifiedCount ?? 0;
    } catch (err: any) {
      const writeErrors = err?.writeErrors ?? [];
      if (writeErrors.length) {
        for (const we of writeErrors) {
          summary.errors.push({ _id: batch[we.index]?.updateOne.filter._id, error: we.errmsg ?? String(we) });
        }
        summary.modified += batch.length - writeErrors.length;
      } else {
        summary.errors.push({ _id: 'batch', error: err?.message ?? String(err) });
      }
    }
    batch = [];
  };

  for await (const doc of cursor) {
    summary.scanned++;
    const idKey = String(doc._id);
    visitedFileIds.add(idKey);
    const associations = associationsByFile.get(idKey) ?? [];

    let update: ReturnType<typeof buildUpdateForDoc>;
    try {
      update = buildUpdateForDoc(doc as Record<string, any>, associations, summary);
    } catch (err: any) {
      summary.errors.push({ _id: doc._id, error: err?.message ?? String(err) });
      continue;
    }

    if (!update) {
      summary.skipped++;
      continue;
    }

    summary.matched++;
    batch.push({ updateOne: { filter: { _id: doc._id }, update } });

    if (batch.length >= batchSize) {
      await flushBatch();
    }
  }

  await flushBatch();

  // Associations whose `file` never matched a document we scanned
  for (const [fileIdKey, assocs] of associationsByFile.entries()) {
    if (!visitedFileIds.has(fileIdKey)) {
      summary.orphanedAssociations.push(...assocs.map((a) => a._id));
    }
  }

  console.log(
    `[migrateFiles] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.manualReviewNeeded.length) {
    console.warn(
      `[migrateFiles] ${summary.manualReviewNeeded.length} document(s) missing required field(s) that couldn't be derived:`,
      summary.manualReviewNeeded,
    );
  }
  if (summary.multipleAssociations.length) {
    console.warn(
      `[migrateFiles] ${summary.multipleAssociations.length} file(s) have MORE THAN ONE association — ` +
        `not auto-merged, needs a manual decision:`,
      summary.multipleAssociations,
    );
  }
  if (summary.droppedFieldNames.length) {
    console.warn(
      `[migrateFiles] ${summary.droppedFieldNames.length} association fieldName value(s) had no home in the new schema and were dropped:`,
      summary.droppedFieldNames,
    );
  }
  if (summary.orphanedAssociations.length) {
    console.warn(
      `[migrateFiles] ${summary.orphanedAssociations.length} fileassociation doc(s) point at a file that no longer exists:`,
      summary.orphanedAssociations,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateFiles] Errors:', summary.errors);
  }

  return summary;
}

/**
 * Checks for duplicate publicId values (derived from cloudinaryId) BEFORE
 * you rely on the new schema's `unique: true` index. Run this after
 * migrateFiles() and resolve any duplicates it reports — otherwise index
 * creation will fail.
 */
export async function findDuplicatePublicIds(): Promise<{ publicId: string; count: number; ids: unknown[] }[]> {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }
  const collection = db.collection('files');
  const dupes = await collection
    .aggregate([
      { $match: { publicId: { $exists: true, $ne: null } } },
      { $group: { _id: '$publicId', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  const result = dupes.map((d: any) => ({ publicId: d._id, count: d.count, ids: d.ids }));
  if (result.length) {
    console.warn(`[findDuplicatePublicIds] ${result.length} duplicate publicId value(s) found:`, result);
  } else {
    console.log('[findDuplicatePublicIds] No duplicates found — safe to build the unique index.');
  }
  return result;
}

 async function main() {
    await mongoose.connect(env.MONGODB_URI!);
     const dry = await migrateFiles({ dryRun: true });
    console.log(dry.manualReviewNeeded, dry.multipleAssociations, dry.orphanedAssociations);
    await migrateFiles({ dryRun: false });
    await findDuplicatePublicIds();
    await mongoose.disconnect();
  }

