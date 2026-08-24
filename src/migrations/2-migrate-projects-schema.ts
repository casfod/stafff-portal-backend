/**
 * migrate-projects-schema.ts
 *
 * Migrates documents in the `projects` collection from the legacy schema
 * (snake_case field names, no milestones) to the new schema defined in
 * Project.model.ts.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere in the app
 *   (this script does not connect/disconnect).
 * - This script talks to the raw collection via the native driver
 *   (mongoose.connection.db) rather than the Mongoose model, since the
 *   legacy documents contain field names (project_title, account_code, etc.)
 *   that no longer exist on the new schema.
 *
 * WHAT IT DOES
 * 1. Renames:
 *      project_title         -> projectTitle
 *      project_partners      -> projectPartners
 *      project_code          -> projectCode
 *      implementation_period -> implementationPeriod
 *      project_budget        -> projectBudget
 *      account_code          -> accountCodes
 *      project_locations     -> projectLocations
 *      target_beneficiaries  -> targetBeneficiaries
 *      project_objectives    -> projectObjectives
 *      project_summary       -> projectSummary
 * 2. Adds `milestones: []` where missing (new required-with-default field).
 * 3. Trims projectTitle / donor / projectCode / projectObjectives / projectSummary
 *    (the new schema declares `trim: true` on these, but that only applies
 *    on Mongoose-validated saves — not on a raw collection update).
 * 4. Normalizes `sectors[].name` against the new enum
 *    ['Education','Protection','WASH','Nutrition/Health','Livelihood'].
 *    Known legacy variants (e.g. "Nutrition", "Health") are mapped to
 *    'Nutrition/Health'. Anything else that doesn't match is left
 *    untouched and reported in the summary for manual review — the script
 *    never silently drops or guesses at unrecognized data.
 * 5. Flags (but does NOT truncate) any string fields that exceed the new
 *    schema's maxlength constraints, since truncating would lose data.
 *    You get a list of offending _ids/fields/lengths to fix by hand or
 *    decide how to handle before the Mongoose model can validate-save them.
 *    NOTE: your pasted sample document's project_objectives is ~1400 chars
 *    against a new maxlength of 400 — you will very likely see this flagged.
 *
 * USAGE
 *   import { migrateProjects } from './migrate-projects-schema';
 *   await migrateProjects({ dryRun: true });   // inspect first
 *   await migrateProjects({ dryRun: false });  // then apply
 */

import mongoose from 'mongoose';
import { env } from "../config/env";
import { Project } from '../models/Project.model';

interface MigrationOptions {
  dryRun?: boolean;
  batchSize?: number;
}

interface LengthViolation {
  _id: unknown;
  field: string;
  maxLength: number;
  actualLength: number;
}

interface SectorIssue {
  _id: unknown;
  originalName: string;
}

interface MigrationSummary {
  scanned: number;
  matched: number;
  modified: number;
  skipped: number;
  errors: { _id: unknown; error: string }[];
  lengthViolations: LengthViolation[];
  unmappedSectors: SectorIssue[];
}

const FIELD_RENAMES: Record<string, string> = {
  project_title: 'projectTitle',
  project_partners: 'projectPartners',
  project_code: 'projectCode',
  implementation_period: 'implementationPeriod',
  project_budget: 'projectBudget',
  account_code: 'accountCodes',
  project_locations: 'projectLocations',
  target_beneficiaries: 'targetBeneficiaries',
  project_objectives: 'projectObjectives',
  project_summary: 'projectSummary',
};

const MAX_LENGTHS: Record<string, number> = {
  projectTitle: 200,
  donor: 50,
  projectCode: 50,
  projectObjectives: 400,
  projectSummary: 4000,
};

const TRIM_FIELDS = ['projectTitle', 'donor', 'projectCode', 'projectObjectives', 'projectSummary'];

const VALID_SECTORS = ['Education', 'Protection', 'WASH', 'Nutrition/Health', 'Livelihood'];

// Known legacy spellings/variants -> new enum value. Extend as you discover more.
const SECTOR_NORMALIZATION_MAP: Record<string, string> = {
  Nutrition: 'Nutrition/Health',
  Health: 'Nutrition/Health',
  'Nutrition / Health': 'Nutrition/Health',
  'nutrition/health': 'Nutrition/Health',
};

function buildUpdateForDoc(
  doc: Record<string, any>,
  summary: MigrationSummary,
): { $set?: Record<string, any>; $unset?: Record<string, ''> } | null {
  const $set: Record<string, any> = {};
  const $unset: Record<string, ''> = {};

  // 1. Rename fields
  for (const [oldKey, newKey] of Object.entries(FIELD_RENAMES)) {
    if (doc[oldKey] !== undefined) {
      if (doc[newKey] === undefined) $set[newKey] = doc[oldKey];
      $unset[oldKey] = '';
    }
  }

  // Helper to read the "effective" value: whatever will end up in the doc
  // after this update — i.e. the new-key value if already present, else
  // whatever we're about to $set for it.
  const effective = (newKey: string) =>
    $set[newKey] !== undefined ? $set[newKey] : doc[newKey];

  // 2. milestones default
  if (doc.milestones === undefined) {
    $set.milestones = [];
  }

  // 3. Trim string fields
  for (const field of TRIM_FIELDS) {
    const value = effective(field);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== value) {
        $set[field] = trimmed;
      }
    }
  }

  // 4. Normalize sectors[].name against the new enum
  const sectors = effective('sectors');
  if (Array.isArray(sectors)) {
    let sectorsChanged = false;
    const newSectors = sectors.map((s: any) => {
      if (!s || typeof s.name !== 'string') return s;
      if (VALID_SECTORS.includes(s.name)) return s;

      const mapped = SECTOR_NORMALIZATION_MAP[s.name];
      if (mapped) {
        sectorsChanged = true;
        return { ...s, name: mapped };
      }

      summary.unmappedSectors.push({ _id: doc._id, originalName: s.name });
      return s;
    });
    if (sectorsChanged) {
      $set.sectors = newSectors;
    }
  }

  // 5. Flag (don't truncate) maxlength violations
  for (const [field, maxLength] of Object.entries(MAX_LENGTHS)) {
    const value = effective(field);
    if (typeof value === 'string' && value.length > maxLength) {
      summary.lengthViolations.push({
        _id: doc._id,
        field,
        maxLength,
        actualLength: value.length,
      });
    }
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateProjects(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('projects');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    lengthViolations: [],
    unmappedSectors: [],
  };

  const cursor = collection.find({});
  let batch: { updateOne: { filter: { _id: any }; update: any } }[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;
    if (dryRun) {
      summary.modified += batch.length;
      batch = [];
      return;
    }
    try {
      const result = await collection.bulkWrite(batch, { ordered: false });
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

    let update: ReturnType<typeof buildUpdateForDoc>;
    try {
      update = buildUpdateForDoc(doc as Record<string, any>, summary);
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

  console.log(
    `[migrateProjects] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.lengthViolations.length) {
    console.warn(
      `[migrateProjects] ${summary.lengthViolations.length} maxlength violation(s) — data was NOT truncated:`,
      summary.lengthViolations,
    );
  }
  if (summary.unmappedSectors.length) {
    console.warn(
      `[migrateProjects] ${summary.unmappedSectors.length} sector name(s) don't match the new enum and weren't auto-mapped:`,
      summary.unmappedSectors,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateProjects] Errors:', summary.errors);
  }

  return summary;
}



 async function main() {
 await mongoose.connect(env.MONGODB_URI!);
 const dry = await migrateProjects({ dryRun: true });
 console.log(dry);              // review lengthViolations / unmappedSectors first
 await migrateProjects({ dryRun: false });
 await mongoose.disconnect();
 }

