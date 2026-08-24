import mongoose from 'mongoose';

export type DocNumberFormat =
  | 'prefix-serial'          // e.g.  AR-CASFOD001
  | 'prefix-dash-serial'     // e.g.  SS-CASFOD-001
  | 'draft';                 // e.g.  AR-DRAFT-<ts>-<rand>

export interface GenerateDocNumberOptions {
  /** Mongoose model name used to count existing documents */
  modelName: string;
  /** Prefix for the code, e.g. "AR-CASFOD" or "SS-CASFOD-" */
  prefix: string;
  /** Zero-pad width for the serial number (default: 3) */
  padLength?: number;
  /**
   * Filter applied when counting to determine the next serial.
   * Defaults to excluding draft documents: { status: { $ne: 'draft' } }
   */
  countFilter?: Record<string, unknown>;
}

/**
 * Generates a sequential document reference number.
 *
 * @example
 *   const code = await generateDocNumber({
 *     modelName: 'AdvanceRequest',
 *     prefix: 'AR-CASFOD',
 *   });
 *   // → 'AR-CASFOD001'
 */
export async function generateDocNumber(
  options: GenerateDocNumberOptions,
): Promise<string> {
  const { modelName, prefix, padLength = 3, countFilter } = options;

  const filter = countFilter ?? { status: { $ne: 'draft' } };
  const count = await mongoose.model(modelName).countDocuments(filter);
  const serial = (count + 1).toString().padStart(padLength, '0');
  return `${prefix}${serial}`;
}

/**
 * Generates a temporary draft code that is unique but not sequential.
 *
 * @example
 *   const code = generateDraftCode('AR');
 *   // → 'AR-DRAFT-1716000000000-x7k2m'
 */
export function generateDraftCode(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 11);
  return `${prefix}-DRAFT-${Date.now()}-${rand}`;
}
