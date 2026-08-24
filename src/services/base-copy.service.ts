import mongoose, { Model } from 'mongoose';
import { notify } from './notifications/notification.service';
import { CurrentUser } from './shared/types';

// ─── Base copy service used by all document types ─────────────────────────────
export class BaseCopyService<T = any> {
  constructor(
    protected readonly model: Model<T>,
    protected readonly modelName: string,
  ) {}

  private normalizeId(id: unknown): string | null {
    if (!id) return null;
    if (typeof id === 'string') return id;
    if (id instanceof mongoose.Types.ObjectId) return id.toString();
    return null;
  }

  protected async verifyCanShare(document: any, currentUser: CurrentUser): Promise<void> {
    const userId = this.normalizeId(currentUser._id);
    const createdBy = this.normalizeId(document.createdBy);
    const isCreator = createdBy === userId;
    const canShare = isCreator || ['SUPER-ADMIN', 'ADMIN', 'REVIEWER'].includes(currentUser.role);
    if (!canShare) {
      throw new Error('Unauthorized: You are not the creator of this document');
    }
  }

  protected async addRecipients(
    requestId: string,
    recipients: mongoose.Types.ObjectId[],
  ): Promise<T> {
    const updated = await (this.model as any)
      .findByIdAndUpdate(
        requestId,
        { $addToSet: { copiedTo: { $each: recipients } } },
        { new: true, runValidators: true },
      )
      .populate('copiedTo', 'email firstName lastName');

    if (!updated) throw new Error(`${this.modelName} not found`);
    return updated;
  }

  async copyDocument(opts: {
    currentUser: CurrentUser;
    requestId: string;
    requestType: string;
    requestTitle: string;
    recipients: mongoose.Types.ObjectId[];
  }): Promise<T> {
    if (!opts.requestId || !opts.recipients?.length) {
      throw new Error('Invalid input parameters');
    }

    const doc = await (this.model as any).findById(opts.requestId);
    if (!doc) throw new Error(`${this.modelName} not found`);

    await this.verifyCanShare(doc, opts.currentUser);
    const updated = await this.addRecipients(opts.requestId, opts.recipients);

    await notify.sendCopyNotification({
      originalSender: opts.currentUser._id,
      requestId: opts.requestId,
      requestType: opts.requestType,
      requestTitle: opts.requestTitle,
      recipients: opts.recipients,
    }).catch((err) => console.error('[BaseCopyService] notify error:', err));

    return updated;
  }
}
