import mongoose, { Schema, Document } from 'mongoose';
import { toJsonTransform } from './shared/toJson';
import { commentSchema, IComment } from './shared/comment.schema';

// ─── Comment sub-shape ─────────────────────────────────────────────────────
// Mirrors the shape shared/helpers.ts's buildComment() produces, so Vendor
// can use the same addComment/updateComment/deleteComment operations the
// other workflow documents use if that's ever wired up.

export interface IVendor extends Document {
  businessName: string;
  businessType: string;
  businessRegNumber: string;
  businessState: string;
  operatingLga?: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  address: string;
  email: string;
  businessPhoneNumber: string;
  contactPhoneNumber: string;
  categories: string[];
  contactPerson: string;
  createdBy: mongoose.Types.ObjectId;
  position: string;
  vendorCode: string;
  // Set once a real code replaces the temporary "DRAFT-{id}" placeholder,
  // so the original placeholder isn't lost.
  originalVendorCode?: string;
  tinNumber: string;

  // ─── Single-step approval workflow ────────────────────────────────────────
  status: 'draft' | 'pending' | 'approved' | 'rejected' | 'archived';
  // Chosen by createdBy at creation time (who is responsible for approving
  // or rejecting this vendor) — not assigned later like a two-step review.
  approvedBy?: mongoose.Types.ObjectId | null;
  comments: IComment[];
  copiedTo: mongoose.Types.ObjectId[];

  createdAt: Date;
  updatedAt: Date;
}

const phoneValidator = {
  validator: (v: string) => /^\d{11}$/.test(v),
  message: 'Phone number must be exactly 11 digits',
};

const vendorSchema = new Schema<IVendor>(
  {
    businessName:       { type: String, required: true, trim: true },
    businessType:       { type: String, required: true, trim: true },
    businessRegNumber:  { type: String, required: true, unique: true, trim: true },
    businessState:      { type: String, required: true, trim: true },
    operatingLga:       { type: String, trim: true },
    accountNumber:      { type: String, required: true, trim: true },
    accountName:        { type: String, required: true, trim: true },
    bankName:           { type: String, required: true, trim: true },
    address:            { type: String, required: true, trim: true },
    email:              { type: String, required: true, trim: true, unique: true },
    businessPhoneNumber:{ type: String, required: true, trim: true, validate: phoneValidator },
    contactPhoneNumber: { type: String, required: true, trim: true, validate: phoneValidator },
    categories: {
      type: [String],
      required: true,
      default: [],
      validate: {
        validator: (cats: string[]) =>
          cats.every((c) => typeof c === 'string' && c.trim().length > 0),
        message: 'Each category must be a non-empty string',
      },
    },
    contactPerson: { type: String, required: true, trim: true },
    createdBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    position:      { type: String, required: true },
    // Still required at the schema level — a pre('validate') hook below
    // auto-fills a temporary "DRAFT-{id}" placeholder when the caller
    // doesn't supply one, so nothing has to change at the API boundary.
    vendorCode:         { type: String, required: true, unique: true, uppercase: true, trim: true },
    originalVendorCode: { type: String, uppercase: true, trim: true },
    tinNumber:          { type: String, required: true },

    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected', 'archived'],
      default: 'pending',
    },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    comments:   { type: [commentSchema], default: [] },
    copiedTo:   [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

// Duplicate/uniqueness enforcement matches V1's intent: multiple drafts,
// pending, or rejected vendors can share these fields — only one *approved*
// vendor can hold each. Direct createVendorService/updateVendorStatusService
// callers should still pre-check via checkUniqueFieldsForSubmission below,
// since a partial unique index alone doesn't produce a friendly error.
vendorSchema.index(
  { businessName: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'approved' } },
);
vendorSchema.index(
  { businessRegNumber: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: 'approved' } },
);
vendorSchema.index(
  { email: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: 'approved',
      $and: [
        { email: { $exists: true } },
        { email: { $ne: null } },
        { email: { $ne: '' } },
      ],
    },
  },
);

/**
 * Generate a vendor code from the business name: first 3 letters + 3 random
 * digits (e.g. TEC123), retried on collision. Ported from V1's
 * VendorModel.js generateVendorCode.
 */
async function generateVendorCode(businessName: string): Promise<string> {
  if (!businessName || businessName.length < 3) {
    throw new Error('Business name must be at least 3 characters long');
  }

  let prefix = businessName
    .substring(0, 3)
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase();

  if (prefix.length < 3) {
    prefix = prefix.padEnd(3, 'X');
  }

  const generateRandomDigits = () => Math.floor(100 + Math.random() * 900).toString();

  const maxAttempts = 10;
  for (let attempts = 1; attempts <= maxAttempts; attempts++) {
    const candidate = `${prefix}${generateRandomDigits()}`;
    const existing = await Vendor.findOne({ vendorCode: candidate });
    if (!existing) return candidate;
  }

  throw new Error(`Unable to generate unique vendor code after ${maxAttempts} attempts`);
}

// Auto-fill a temporary code before validation so vendorCode's `required`
// constraint is satisfied without the caller (or createVendorSchema) having
// to supply a real one up front.
vendorSchema.pre('validate', function (next) {
  if (!this.vendorCode) {
    this.vendorCode = `DRAFT-${this._id}`;
  }
  next();
});

// When a vendor is approved and is still carrying a temporary code,
// generate the permanent one. Preserves the temp code in
// originalVendorCode first, matching V1.
vendorSchema.pre('save', async function (next) {
  try {
    if (
      this.isModified('status') &&
      this.status === 'approved' &&
      this.vendorCode?.startsWith('DRAFT-')
    ) {
      this.originalVendorCode = this.originalVendorCode || this.vendorCode;
      this.vendorCode = await generateVendorCode(this.businessName);
    }
    next();
  } catch (error) {
    next(error as Error);
  }
});

vendorSchema.set('toJSON', toJsonTransform());

export const Vendor = mongoose.model<IVendor>('Vendor', vendorSchema);
export { generateVendorCode };