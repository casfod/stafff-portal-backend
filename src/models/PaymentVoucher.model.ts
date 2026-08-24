import mongoose, { Schema, Document } from 'mongoose';
import { toJsonTransform } from './shared/toJson';
import { generateDraftCode } from '../utils/generateDocNumber';

export type PaymentVoucherStatus = 'draft' | 'pending' | 'reviewed' | 'approved' | 'rejected' | 'paid';

export interface IPaymentVoucher extends Document {
  pvNumber: string;
  payingStation: string;
  payTo: string;
  being: string;
  pvDate: string;
  amountInWords: string;
  accountCode: string;
  projectCode: string;
  project: string;
  grossAmount: number;
  vat: number;
  wht: number;
  devLevy: number;
  otherDeductions: number;
  netAmount: number;
  chartOfAccountCategories: string;
  organisationalChartOfAccount: string;
  chartOfAccountCode: string;
  note: string;
  createdBy: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  comments: Array<{ user: mongoose.Types.ObjectId; text: string }>;
  copiedTo: mongoose.Types.ObjectId[];
  status: PaymentVoucherStatus;
  createdAt: Date;
  updatedAt: Date;
}

const paymentVoucherSchema = new Schema<IPaymentVoucher>(
  {
    pvNumber:                     { type: String, unique: true, trim: true },
    payingStation:                { type: String, required: true, trim: true },
    payTo:                        { type: String, required: true, trim: true },
    being:                        { type: String, required: true, trim: true },
    pvDate:                       { type: String, required: true, trim: true },
    amountInWords:                { type: String, required: true, trim: true },
    accountCode:                  { type: String, required: true, trim: true },
    projectCode:                  { type: String, required: true, trim: true },
    project:                      { type: String, required: true, trim: true },
    grossAmount:                  { type: Number, required: true, min: 0 },
    vat:                          { type: Number, default: 0, min: 0 },
    wht:                          { type: Number, default: 0, min: 0 },
    devLevy:                      { type: Number, default: 0, min: 0 },
    otherDeductions:              { type: Number, default: 0, min: 0 },
    netAmount:                    { type: Number, required: true, min: 0 },
    chartOfAccountCategories:     { type: String, required: true, trim: true },
    organisationalChartOfAccount: { type: String, required: true, trim: true },
    chartOfAccountCode:           { type: String, required: true, trim: true },
    note:                         { type: String, default: '' },
    createdBy:                    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy:                   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy:                   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    comments: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        text: { type: String, required: true, trim: true },
        _id: false,
      },
    ],
    copiedTo: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['draft', 'pending', 'reviewed', 'approved', 'rejected', 'paid'],
      default: 'draft',
    },
  },
  { timestamps: true },
);

// ─── PV number generation ────────────────────────────────────────────────────
// Format for non-draft: CASFOD/<projectCode>/<MM>/<YYYY>/<serial>
// e.g. CASFOD/PROJECT-A/03/2026/001

paymentVoucherSchema.pre('save', async function (next) {
  if (!this.isNew || this.pvNumber) return next();

  try {
    if (this.status === 'draft') {
      this.pvNumber = generateDraftCode('PV');
      return next();
    }

    const pvDate = new Date(this.pvDate);
    const month = String(pvDate.getMonth() + 1).padStart(2, '0');
    const year = pvDate.getFullYear();
    const formattedCode = this.projectCode.replace(/\s+/g, '-');

    const startOfMonth = new Date(year, pvDate.getMonth(), 1);
    const endOfMonth   = new Date(year, pvDate.getMonth() + 1, 0, 23, 59, 59, 999);

    const count = await mongoose.model('PaymentVoucher').countDocuments({
      projectCode: this.projectCode,
      pvDate: {
        $gte: startOfMonth.toISOString().split('T')[0],
        $lte: endOfMonth.toISOString().split('T')[0],
      },
      status: { $ne: 'draft' },
      pvNumber: { $not: /PV-DRAFT/ },
    });

    const serial = (count + 1).toString().padStart(3, '0');
    this.pvNumber = `CASFOD/${formattedCode}/${month}/${year}/${serial}`;
    next();
  } catch (err) {
    next(err as Error);
  }
});

/** Reject negative net amounts */
paymentVoucherSchema.pre('save', function (next) {
  if (this.netAmount < 0) return next(new Error('Net amount cannot be negative'));
  next();
});

paymentVoucherSchema.set('toJSON', toJsonTransform());

export const PaymentVoucher = mongoose.model<IPaymentVoucher>(
  'PaymentVoucher',
  paymentVoucherSchema,
);
