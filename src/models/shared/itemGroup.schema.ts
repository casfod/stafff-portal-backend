import { Schema } from "mongoose";

export interface IItemGroup {
  itemName?: string;
  description: string;
  frequency: number;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

/** Base procurement line-item (purchase request, advance request, etc.) */
export const itemGroupSchema = new Schema<IItemGroup>(
  {
    itemName: { type: String, trim: true },
    description: { type: String, required: true, trim: true },
    frequency: { type: Number, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, default: "" },
    unitCost: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false }
);

export interface IExpenseItem {
  expense: string;
  description?: string;
  frequency: number;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
}

/** Expense-style line-item (travel request, expense claims) */
export const expenseItemSchema = new Schema<IExpenseItem>(
  {
    expense: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    frequency: { type: Number, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, default: "" },
    unitCost: { type: Number, required: true },
    total: { type: Number, required: true },
  },
  { _id: false }
);
