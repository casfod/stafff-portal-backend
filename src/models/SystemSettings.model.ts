import mongoose, { Schema, Document } from 'mongoose';
import { toJsonTransform } from './shared/toJson';

export interface ISystemSettings extends Document {
  globalEmploymentInfoLock: boolean;
  lastUpdatedBy?: mongoose.Types.ObjectId;
  lastUpdatedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const systemSettingsSchema = new Schema<ISystemSettings>(
  {
    globalEmploymentInfoLock: { type: Boolean, default: false },
    lastUpdatedBy:            { type: Schema.Types.ObjectId, ref: 'User' },
    lastUpdatedAt:            { type: Date, default: Date.now },
  },
  { timestamps: true },
);

/** Enforce singleton — only one settings document may exist */
systemSettingsSchema.pre('save', async function (next) {
  if (this.isNew) {
    const count = await mongoose.model('SystemSettings').countDocuments();
    if (count > 0) {
      return next(new Error('Only one SystemSettings document can exist'));
    }
  }
  next();
});

systemSettingsSchema.set('toJSON', toJsonTransform());

export const SystemSettings = mongoose.model<ISystemSettings>(
  'SystemSettings',
  systemSettingsSchema,
);
