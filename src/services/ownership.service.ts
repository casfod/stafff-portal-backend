import mongoose from 'mongoose';
import { CurrentUser } from './shared/types';

// ─── Ownership verification ────────────────────────────────────────────────────
export class OwnershipService {
  static verify(
    document: any,
    userId: mongoose.Types.ObjectId | string,
  ): true {
    const id = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;

    if (!document.createdBy || !document.createdBy.equals(id)) {
      throw new Error('Unauthorized: Document creator mismatch');
    }

    return true;
  }

  /** Role-aware check — admins bypass ownership requirement */
  static verifyOrAdmin(document: any, currentUser: CurrentUser): true {
    if (['SUPER-ADMIN', 'ADMIN'].includes(currentUser.role)) return true;
    return this.verify(document, currentUser._id);
  }
}
