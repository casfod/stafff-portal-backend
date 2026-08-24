import { Model, Document, FilterQuery, SortOrder } from "mongoose";

interface QueryParams {
  page?: number;
  limit?: number;
  sort?: string;
  fields?: string;
  search?: string;
  [key: string]: any;
}

interface SearchConfig {
  fields: string[];
  exact?: boolean;
}

export class QueryBuilder<T extends Document> {
  private query: FilterQuery<T> = {};
  private sort: Record<string, SortOrder> = { createdAt: -1 };
  private limit: number = 10;
  private page: number = 1;
  private fields: string = "";
  private searchConfig?: SearchConfig;

  constructor(
    private model: Model<T>,
    private params: QueryParams,
    searchConfig?: SearchConfig
  ) {
    this.searchConfig = searchConfig;
    this.buildQuery();
  }

  private buildQuery(): void {
    const { page, limit, sort, fields, search, ...filters } = this.params;

    // Set pagination
    this.page = Math.max(1, parseInt(page as any) || 1);
    this.limit = Math.min(100, Math.max(1, parseInt(limit as any) || 10));

    // Handle sort - validate to prevent injection
    if (sort && typeof sort === 'string') {
      const sortFields: Record<string, SortOrder> = {};
      const allowedFields = ['createdAt', 'updatedAt', 'status', 'name', 'title'];
      
      sort.split(",").forEach((field) => {
        const cleanField = field.replace(/^-/, '');
        // Only allow known fields to prevent injection
        if (allowedFields.includes(cleanField) || allowedFields.some(f => cleanField.includes(f))) {
          if (field.startsWith("-")) {
            sortFields[field.substring(1)] = -1;
          } else {
            sortFields[field] = 1;
          }
        }
      });
      if (Object.keys(sortFields).length > 0) {
        this.sort = sortFields;
      }
    }

    this.fields = (fields as string) || "";

    // Handle search
    if (search && this.searchConfig) {
      const searchRegex = new RegExp(search as string, "i");
      const orConditions = this.searchConfig.fields.map((field) => ({
        [field]: this.searchConfig?.exact ? search : searchRegex,
      }));
      this.query = {
        ...this.query,
        $or: orConditions as any,
      };
    }

    // Handle range filters (gt, gte, lt, lte)
    Object.keys(filters).forEach((key) => {
      const value = filters[key];
      if (value === undefined || value === null || value === "") return;
      
      if (typeof value === "object" && value !== null) {
        const rangeQuery: any = {};
        if (value.gt !== undefined) rangeQuery.$gt = value.gt;
        if (value.gte !== undefined) rangeQuery.$gte = value.gte;
        if (value.lt !== undefined) rangeQuery.$lt = value.lt;
        if (value.lte !== undefined) rangeQuery.$lte = value.lte;
        if (Object.keys(rangeQuery).length > 0) {
          this.query = {
            ...this.query,
            [key]: rangeQuery,
          };
        }
      } else {
        this.query = {
          ...this.query,
          [key]: value,
        };
      }
    });
  }

  async execute(): Promise<{
    data: T[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
      hasNext: boolean;
      hasPrev: boolean;
    };
  }> {
    const skip = (this.page - 1) * this.limit;

    const [data, total] = await Promise.all([
      this.model
        .find(this.query as FilterQuery<T>)
        .sort(this.sort)
        .skip(skip)
        .limit(this.limit)
        .select(this.fields),
      this.model.countDocuments(this.query as FilterQuery<T>),
    ]);

    const pages = Math.ceil(total / this.limit);

    return {
      data,
      pagination: {
        page: this.page,
        limit: this.limit,
        total,
        pages,
        hasNext: this.page < pages,
        hasPrev: this.page > 1,
      },
    };
  }

  getQuery(): FilterQuery<T> {
    return this.query as FilterQuery<T>;
  }

  setAdditionalFilter(filter: FilterQuery<T>): this {
    this.query = { ...this.query, ...filter } as FilterQuery<T>;
    return this;
  }
}