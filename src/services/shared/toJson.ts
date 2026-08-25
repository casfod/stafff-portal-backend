// shared/toJson.ts
export const toJsonTransform = (excludeFields: string[] = []) => {
  return {
    transform: (doc: any, ret: any) => {
      // Convert _id to id
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;

      // Remove any excluded fields
      excludeFields.forEach(field => {
        delete ret[field];
      });
      
      return ret;
    }
  };
};