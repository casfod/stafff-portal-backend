// services/shared/search.config.ts

export const searchConfig = {
  // Workflow Documents
  conceptNotes: {
    fields: ["cnNumber", "staffName", "activityTitle", "status"],
  },
  advanceRequests: {
    fields: ["arNumber", "department", "createdBy", "status"],
  },
  purchaseRequests: {
    fields: ["pcrNumber", "department", "createdBy", "status"],
  },
  expenseClaims: {
    fields: ["ecNumber", "staffName", "expenseReason", "status"],
  },
  travelRequests: {
    fields: ["trNumber", "staffName", "travelReason", "status"],
  },
  paymentRequests: {
    fields: ["pmrNumber", "requestBy", "purposeOfExpense", "status"],
  },
  paymentVouchers: {
    fields: ["pvNumber", "payTo", "being", "accountCode", "status"],
  },
  purchaseOrders: {
    fields: ["poCode", "rfqCode", "rfqTitle", "status"],
  },
  rfqs: {
    fields: ["rfqCode", "rfqTitle", "status"],
  },
  goodsReceived: {
    fields: ["grdCode"],
  },

  // HR Documents
  leaves: {
    fields: ["leaveNumber", "staffName", "leaveType", "status"],
  },
  staffStrategies: {
    fields: ["strategyCode", "staffName", "department", "status"],
  },
  appraisals: {
    fields: ["appraisalCode", "staffName", "position", "department", "status"],
  },

  // Core Entities
  projects: {
    fields: ["projectTitle", "donor", "projectCode"],
  },
  users: {
    fields: ["firstName", "lastName", "email", "role"],
  },
  vendors: {
    fields: ["businessName", "businessRegNumber", "email", "vendorCode"],
  },
};

export const filterConfig = {
  conceptNotes: {
    allowedFilters: ["status", "createdBy", "project"],
    rangeFilters: ["activityBudget", "createdAt"],
  },
  advanceRequests: {
    allowedFilters: ["status", "createdBy", "project", "department"],
    rangeFilters: ["createdAt"],
  },
  purchaseRequests: {
    allowedFilters: ["status", "createdBy", "project", "department", "financeReviewStatus", "procurementReviewStatus"],
    rangeFilters: ["createdAt"],
  },
  expenseClaims: {
    allowedFilters: ["status", "createdBy", "project"],
    rangeFilters: ["budget", "createdAt"],
  },
  travelRequests: {
    allowedFilters: ["status", "createdBy", "project"],
    rangeFilters: ["budget", "createdAt"],
  },
  paymentVouchers: {
    allowedFilters: ["status", "createdBy", "projectCode"],
    rangeFilters: ["netAmount", "createdAt"],
  },
  appraisals: {
    allowedFilters: ["status", "department", "staffId", "supervisorId"],
    rangeFilters: ["createdAt"],
  },
  leaves: {
    allowedFilters: ["status", "leaveType", "user"],
    rangeFilters: ["totalDaysApplied", "createdAt"],
  },
};