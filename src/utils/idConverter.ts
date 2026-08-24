import mongoose from 'mongoose';

/**
 * Safely convert any value to string, handling ObjectId properly
 */
export const toStringId = (id: any): string => {
  if (!id) return '';
  if (id instanceof mongoose.Types.ObjectId) {
    return id.toString();
  }
  if (typeof id === 'string') {
    return id;
  }
  return String(id);
};

/**
 * Safely convert optional ID to string or undefined
 */
export const toOptionalStringId = (id: any): string | undefined => {
  if (!id) return undefined;
  if (id instanceof mongoose.Types.ObjectId) {
    return id.toString();
  }
  if (typeof id === 'string') {
    return id;
  }
  return String(id);
};

/**
 * Safely convert string to ObjectId or return null
 */
export const toObjectId = (id: string | undefined): mongoose.Types.ObjectId | null => {
  if (!id) return null;
  if (mongoose.Types.ObjectId.isValid(id)) {
    return new mongoose.Types.ObjectId(id);
  }
  return null;
};

/**
 * Safely convert string to ObjectId or throw error
 */
export const toObjectIdOrThrow = (id: string): mongoose.Types.ObjectId => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`Invalid ObjectId: ${id}`);
  }
  return new mongoose.Types.ObjectId(id);
};