/**
 * Standard toJSON transform:
 *  - promotes _id → id
 *  - strips __v
 *  - strips any extra fields passed in `omit`
 */
export function toJsonTransform(omit: string[] = []) {
  return {
    virtuals: true,
    transform: (_doc: any, ret: Record<string, any>) => {
      if (ret._id) {
        ret.id = ret._id.toString();
        delete ret._id;
      }
      delete ret.__v;
      omit.forEach((field) => delete ret[field]);
      return ret;
    },
  };
}
