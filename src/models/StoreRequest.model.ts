import mongoose, { Schema, Document } from 'mongoose';
import { commentSchema, IComment } from './shared/comment.schema';
import { IStoreItemGroup, storeItemGroupSchema } from './shared/itemGroup.schema';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber, generateDraftCode } from '../utils/generateDocNumber';
import { WorkflowStatus } from './ConceptNote.model';

type StoreRequestType = 'dispatch' | 'return';


export interface IStoreRequest extends Document {
  srCode: string;
  destination: string;
  warehouse: string;
  warehouseCode: string;
  requestType: StoreRequestType;
  requestedAt: Date;
  dispatchDate: Date;
  recipient: mongoose.Types.ObjectId;
  warehouseOfficer: mongoose.Types.ObjectId;
  assignedDriver?: string;
  approvedBy?: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  items: IStoreItemGroup[];
  comments: IComment[];
  copiedTo?: mongoose.Types.ObjectId[];
  status: WorkflowStatus;
  isReturned?: boolean;
  returnedRequestId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const storeRequestSchema = new Schema<IStoreRequest>(
  {
    srCode:            { type: String, unique: true, sparse: true, trim: true },
    destination:  { type: String, required: true, trim: true },
    warehouse: { type: String, required: true, trim: true },
    warehouseCode: { type: String, required: true, trim: true },
    requestType: { type: String, required: true, enum: ['dispatch', 'return'], default: 'dispatch', },
    requestedAt:         { type: Date, default: null },
    dispatchDate:        { type: Date, default: null },
    approvedBy:          { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedBy:          { type: Schema.Types.ObjectId, ref: 'User', default: null },
    recipient:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
    warehouseOfficer:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedDriver:      { type: String, trim: true },
    items:          [storeItemGroupSchema],
    comments:            [commentSchema],
    copiedTo:            [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['draft', 'pending', 'reviewed', 'approved', 'rejected'],
      default: 'draft',
    },
    isReturned: { type: Boolean, default: false },
    returnedRequestId: { type: Schema.Types.ObjectId, ref: 'StoreRequest', default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// ─── Doc number generation ────────────────────────────────────────────────────

storeRequestSchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === 'pending' && !this.srCode) {
    try {
      this.srCode = await generateDocNumber({ modelName: 'StoreRequest', prefix: 'SR-CASFOD' });
    } catch (err) {
      return next(err as Error);
    }
  } else if (this.status === 'draft' && !this.srCode) {
    this.srCode = generateDraftCode('SR');
  }
  next();
});

storeRequestSchema.set('toJSON', toJsonTransform());

export const StoreRequest = mongoose.model<IStoreRequest>(
  'StoreRequest',
  storeRequestSchema,
);
