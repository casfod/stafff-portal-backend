import mongoose, { Schema, Document } from 'mongoose';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber, generateDraftCode } from '../utils/generateDocNumber';

export interface IRFQItemGroup {
  description: string;
  itemName?: string;
  frequency: number;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

export type RFQStatus = 'preview' | 'draft' | 'sent' | 'cancelled';

export interface IRFQ extends Document {
  rfqTitle: string;
  rfqCode: string;
  itemGroups: IRFQItemGroup[];
  copiedTo: mongoose.Types.ObjectId[];  // Vendor refs
  deadlineDate: string;
  rfqDate: string;
  casfodAddressId: string;
  pdfUrl: string;
  cloudinaryId: string;
  createdBy: mongoose.Types.ObjectId;
  status: RFQStatus;
  createdAt: Date;
  updatedAt: Date;
}

const rfqItemGroupSchema = new Schema<IRFQItemGroup>(
  {
    description: { type: String, required: true, trim: true },
    itemName:    { type: String, trim: true },
    frequency:   { type: Number, required: true },
    quantity:    { type: Number, required: true },
    unit:        { type: String, default: '' },
    unitCost:    { type: Number, default: 0 },
    total:       { type: Number, default: 0 },
  },
  { _id: false },
);

const rfqSchema = new Schema<IRFQ>(
  {
    rfqTitle:        { type: String, default: 'Request for Quotation' },
    rfqCode:         { type: String, unique: true, sparse: true },
    itemGroups:      [rfqItemGroupSchema],
    copiedTo:        [{ type: Schema.Types.ObjectId, ref: 'Vendor' }],
    deadlineDate:    { type: String, default: '' },
    rfqDate:         { type: String, default: '' },
    casfodAddressId: { type: String, default: '' },
    pdfUrl:          { type: String, default: '' },
    cloudinaryId:    { type: String, default: '' },
    createdBy:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['preview', 'draft', 'sent', 'cancelled'],
      default: 'preview',
    },
  },
  { timestamps: true },
);

// ─── Doc number generation ────────────────────────────────────────────────────

rfqSchema.pre('save', async function (next) {
  if (!this.isNew || this.rfqCode) return next();

  try {
    if (this.status === 'preview' || this.status === 'sent') {
      this.rfqCode = await generateDocNumber({
        modelName: 'RFQ',
        prefix: 'RFQ-CASFOD',
        countFilter: { status: { $in: ['preview', 'sent'] } },
      });
    } else {
      this.rfqCode = generateDraftCode('RFQ');
    }
    next();
  } catch (err) {
    next(err as Error);
  }
});

rfqSchema.set('toJSON', toJsonTransform());

export const RFQ = mongoose.model<IRFQ>('RFQ', rfqSchema);
