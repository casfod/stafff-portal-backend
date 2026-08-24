import mongoose, { Model } from "mongoose";
import { CurrentUser, CommentResult } from "./types";
import { buildComment, filterDeleted, USER_SELECT } from "./helpers";


// ─── Shared comment operations ──────────────────────────────────────────────
export async function addCommentOp(
  Model: Model<any>,
  docId: string,
  currentUser: CurrentUser,
  text: string,
  canCommentCheck: (doc: any, userId: mongoose.Types.ObjectId) => boolean,
  userPopulateSelect: string = USER_SELECT
): Promise<CommentResult> {
  const doc = await Model.findById(docId);
  if (!doc) throw new Error("Document not found");

  if (!canCommentCheck(doc, currentUser._id)) {
    throw new Error("You don't have permission to comment on this document");
  }

  const newComment = buildComment(currentUser._id, text);
  doc.comments.unshift(newComment);
  await doc.save();

  const populated = await Model.findById(docId)
    .populate("comments.user", userPopulateSelect)
    .lean();

  const active = filterDeleted((populated as any).comments || []);
  // Return the newly added comment (most recent)
  return active[0] as CommentResult;
}

export async function updateCommentOp(
  Model: Model<any>,
  docId: string,
  commentId: string,
  userId: mongoose.Types.ObjectId,
  text: string,
  userPopulateSelect: string = USER_SELECT
): Promise<CommentResult> {
  const doc = await Model.findById(docId);
  if (!doc) throw new Error("Document not found");

  const comment = doc.comments.id(commentId);
  if (!comment) throw new Error("Comment not found");
  if (comment.user.toString() !== userId.toString()) {
    throw new Error("You can only edit your own comments");
  }

  comment.text = text.trim();
  comment.edited = true;
  comment.updatedAt = new Date();

  await doc.save();

  const populated = await Model.findById(docId)
    .populate("comments.user", userPopulateSelect)
    .lean();

  const result = (populated as any).comments.find(
    (c: any) => c._id.toString() === commentId
  );
  if (!result) throw new Error("Comment not found after update");
  
  return result as CommentResult;
}

export async function deleteCommentOp(
  Model: Model<any>,
  docId: string,
  commentId: string,
  currentUser: CurrentUser
): Promise<{ success: boolean; message: string }> {
  const doc = await Model.findById(docId);
  if (!doc) throw new Error("Document not found");

  const comment = doc.comments.id(commentId);
  if (!comment) throw new Error("Comment not found");

  const isOwner = comment.user.toString() === currentUser._id.toString();
  const isAdmin = ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);

  if (!isOwner && !isAdmin) {
    throw new Error("You don't have permission to delete this comment");
  }

  comment.deleted = true;
  comment.updatedAt = new Date();

  await doc.save();
  return { success: true, message: "Comment deleted successfully" };
}