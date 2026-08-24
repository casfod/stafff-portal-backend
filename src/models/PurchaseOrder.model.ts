import mongoose, { Schema, Document } from 'mongoose';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber } from '../utils/generateDocNumber';

export interface IPOItemGroup {
  description?: string;
  itemName?: string;
  frequency: number;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

export interface IPurchaseOrder extends Document {
  rfqTitle: string;
  rfqCode: string;
  poCode: string;
  itemGroups: IPOItemGroup[];
  copiedTo: mongoose.Types.ObjectId[];    // Vendor refs
  selectedVendor?: mongoose.Types.ObjectId;
  deliveryDate: string;
  poDate: string;
  casfodAddressId: string;
  totalAmount: number;
  vat: number;
  pdfUrl: string;
  cloudinaryId: string;
  createdBy: mongoose.Types.ObjectId;
  status: 'pending' | 'approved' | 'rejected';
  isFromRfq: boolean;
  comments: Array<{ user: mongoose.Types.ObjectId; text: string }>;
  approvedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const poItemGroupSchema = new Schema<IPOItemGroup>(
  {
    description: { type: String, trim: true },
    itemName:    { type: String, trim: true },
    frequency:   { type: Number, required: true },
    quantity:    { type: Number, required: true },
    unit:        { type: String, default: '' },
    unitCost:    { type: Number, required: true },
    total:       { type: Number, required: true },
  },
);

const purchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    rfqTitle:        { type: String, default: 'Purchase Order' },
    rfqCode:         { type: String, default: '', sparse: true },
    poCode:          { type: String, default: '', unique: true },
    itemGroups:      [poItemGroupSchema],
    copiedTo:        [{ type: Schema.Types.ObjectId, ref: 'Vendor' }],
    selectedVendor:  { type: Schema.Types.ObjectId, ref: 'Vendor' },
    deliveryDate:    { type: String, default: '' },
    poDate:          { type: String, default: '' },
    casfodAddressId: { type: String, default: '' },
    totalAmount:     { type: Number, default: 0 },
    vat:             { type: Number, default: 0 },
    pdfUrl:          { type: String, default: '' },
    cloudinaryId:    { type: String, default: '' },
    createdBy:       { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    isFromRfq: { type: Boolean, default: true },
    comments: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
        text: { type: String, required: true, trim: true },
        _id: false,
      },
    ],
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// ─── Doc number generation ────────────────────────────────────────────────────

purchaseOrderSchema.pre('save', async function (next) {
  if (!this.isNew || this.poCode) return next();

  try {
    this.poCode = await generateDocNumber({
      modelName: 'PurchaseOrder',
      prefix: 'PO-CASFOD',
      countFilter: {},  // count all POs
    });
    next();
  } catch (err) {
    next(err as Error);
  }
});

purchaseOrderSchema.set('toJSON', toJsonTransform());

export const PurchaseOrder = mongoose.model<IPurchaseOrder>(
  'PurchaseOrder',
  purchaseOrderSchema,
);
