import mongoose, { Schema } from "mongoose";

export interface IComment {
  user: mongoose.Types.ObjectId;
  text: string;
  edited: boolean;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export const commentSchema = new Schema<IComment>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true },
    edited: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);
