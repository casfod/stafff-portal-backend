import mongoose, { Schema, Document } from 'mongoose';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber } from '../utils/generateDocNumber';

export interface IGRNItem {
  itemId: string;
  numberOrdered: number;
  numberReceived: number;
  difference: number;
  isFullyReceived: boolean;
}

export interface IGoodsReceived extends Document {
  grdCode: string;
  purchaseOrder: mongoose.Types.ObjectId;
  grnItems: IGRNItem[];
  createdBy: mongoose.Types.ObjectId;
  isCompleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const grnItemSchema = new Schema<IGRNItem>(
  {
    itemId:         { type: String, required: true, trim: true },
    numberOrdered:  { type: Number, required: true },
    numberReceived: { type: Number, required: true },
    difference:     { type: Number, default: 0 },
    isFullyReceived:{ type: Boolean, default: false },
  },
  { _id: false },
);

const goodsReceivedSchema = new Schema<IGoodsReceived>(
  {
    grdCode:       { type: String, unique: true, sparse: true },
    purchaseOrder: { type: Schema.Types.ObjectId, ref: 'PurchaseOrder', required: true },
    grnItems:      [grnItemSchema],
    createdBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isCompleted:   { type: Boolean, default: false },
  },
  { timestamps: true },
);

// ─── Doc number + item status computation ────────────────────────────────────

goodsReceivedSchema.pre('save', async function (next) {
  if (this.isNew && !this.grdCode) {
    try {
      this.grdCode = await generateDocNumber({
        modelName: 'GoodsReceived',
        prefix: 'GRN-CASFOD',
        countFilter: {},  // count all GRNs
      });
    } catch (err) {
      return next(err as Error);
    }
  }

  if (this.grnItems?.length) {
    let allFullyReceived = true;
    for (const item of this.grnItems) {
      item.difference = item.numberOrdered - item.numberReceived;
      item.isFullyReceived = item.difference === 0;
      if (!item.isFullyReceived) allFullyReceived = false;
    }
    this.isCompleted = allFullyReceived;
  }

  next();
});

goodsReceivedSchema.set('toJSON', toJsonTransform());

export const GoodsReceived = mongoose.model<IGoodsReceived>(
  'GoodsReceived',
  goodsReceivedSchema,
);
