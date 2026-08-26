import { z } from 'zod';

// ─── Reusable primitives ──────────────────────────────────────────────────────
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID');
const optionalId = objectId.optional();
const dateRange = z.object({
  from: z.string().min(1),
  to:   z.string().min(1),
});

// ─── Pagination ───────────────────────────────────────────────────────────────
export const paginationSchema = z.object({
  page:   z.coerce.number().int().min(1).optional(),
  limit:  z.coerce.number().int().min(1).max(100).optional(),
  sort:   z.string().optional(),
  search: z.string().optional(),
});

// ─── Status update (shared by most workflow documents) ────────────────────────
export const statusUpdateSchema = z.object({
  status:    z.string().min(1, 'Status is required'),
  comment:   z.string().optional(),
  approvedBy: optionalId,
});

// ─── Copy document to users ───────────────────────────────────────────────────
export const copyDocumentSchema = z.object({
  recipients: z.array(objectId).min(1, 'At least one recipient required'),
});

// ─── Comment ──────────────────────────────────────────────────────────────────
export const addCommentSchema = z.object({
  text: z.string().min(1, 'Comment text is required').trim(),
});

export const updateCommentSchema = z.object({
  text: z.string().min(1, 'Comment text is required').trim(),
});

// ─── Item group (procurement line items) ─────────────────────────────────────
const itemGroupSchema = z.object({
  itemName:    z.string().optional(),
  description: z.string().min(1, 'Description is required'),
  frequency:   z.number().int().min(1),
  quantity:    z.number().int().min(1),
  unit:        z.string().optional(),
  unitCost:    z.number().min(0),
  total:       z.number().min(0),
});

// ─── Expense line item ────────────────────────────────────────────────────────
const expenseItemSchema = z.object({
  expense:     z.string().min(1),
  description: z.string().optional(),
  frequency:   z.number().int().min(1),
  quantity:    z.number().int().min(1),
  unit:        z.string().optional(),
  unitCost:    z.number().min(0),
  total:       z.number().min(0),
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONCEPT NOTE
// ═══════════════════════════════════════════════════════════════════════════════
export const createConceptNoteSchema = z.object({
  expenseChargedTo:            z.string().min(1),
  accountCode:                 z.string().min(1),
  project:                     optionalId,
  activityTitle:               z.string().min(1),
  activityLocation:            z.string().min(1),
  activityPeriod:              dateRange,
  backgroundContext:           z.string().min(1),
  objectivesPurpose:           z.string().min(1),
  detailedActivityDescription: z.string().min(1),
  strategicPlan:               z.string().min(1),
  benefitsOfProject:           z.string().min(1),
  activityBudget:              z.number().min(0),
  meansOfVerification:         z.string().min(1),
  reviewedBy:                  objectId,
  approvedBy:                  optionalId,
  copiedTo:                    z.array(objectId).optional(),
});

export const saveConceptNoteDraftSchema = createConceptNoteSchema
  .omit({ reviewedBy: true })
  .extend({ reviewedBy: optionalId });

// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCE REQUEST
// ═══════════════════════════════════════════════════════════════════════════════
const advanceRequestBase = z.object({
  department:         z.string().min(1),
  suggestedSupplier:  z.string().min(1),
  address:            z.string().min(1),
  finalDeliveryPoint: z.string().min(1),
  city:               z.string().min(1),
  accountNumber:      z.string().min(1),
  accountName:        z.string().min(1),
  bankName:           z.string().min(1),
  expenseChargedTo:   z.string().min(1),
  accountCode:        z.string().min(1),
  project:            optionalId,
  periodOfActivity:   dateRange,
  activityDescription: z.string().optional(),
  itemGroups:         z.array(itemGroupSchema).min(1),
  reviewedBy:         optionalId,
  approvedBy:         optionalId,
  copiedTo:           z.array(objectId).optional(),
});

export const createAdvanceRequestSchema = advanceRequestBase.extend({
  reviewedBy: objectId,
});
export const saveAdvanceRequestDraftSchema = advanceRequestBase;

export const updateAdvanceRequestSchema = advanceRequestBase.partial();

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSE CLAIM
// ═══════════════════════════════════════════════════════════════════════════════
const expenseClaimBase = z.object({
  expenseClaim:     dateRange,
  expenseChargedTo: z.string().min(1),
  accountCode:      z.string().min(1),
  project:          optionalId,
  budget:           z.number().min(0),
  amountInWords:    z.string().min(1),
  expenseReason:    z.string().min(1),
  dayOfDeparture:   z.string().min(1),
  dayOfReturn:      z.string().min(1),
  expenses:         z.array(expenseItemSchema).min(1),
  reviewedBy:       optionalId,
  approvedBy:       optionalId,
  copiedTo:         z.array(objectId).optional(),
});

export const createExpenseClaimSchema = expenseClaimBase.extend({
  reviewedBy: objectId,
});
export const saveExpenseClaimDraftSchema = expenseClaimBase;

// ═══════════════════════════════════════════════════════════════════════════════
// TRAVEL REQUEST
// ═══════════════════════════════════════════════════════════════════════════════
const travelRequestBase = z.object({
  travelRequest:    dateRange,
  expenseChargedTo: z.string().min(1),
  accountCode:      z.string().min(1),
  project:          optionalId,
  budget:           z.number().min(0),
  amountInWords:    z.string().min(1),
  travelReason:     z.string().min(1),
  dayOfDeparture:   z.string().min(1),
  dayOfReturn:      z.string().min(1),
  expenses:         z.array(expenseItemSchema).min(1),
  reviewedBy:       optionalId,
  approvedBy:       optionalId,
  copiedTo:         z.array(objectId).optional(),
});

export const createTravelRequestSchema = travelRequestBase.extend({
  reviewedBy: objectId,
});
export const saveTravelRequestDraftSchema = travelRequestBase;

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT REQUEST
// ═══════════════════════════════════════════════════════════════════════════════
const paymentRequestBase = z.object({
  amountInFigure:     z.number().min(0),
  amountInWords:      z.string().min(1),
  purposeOfExpense:   z.string().min(1),
  grantCode:          z.string().min(1),
  dateOfExpense:      z.string().min(1),
  specialInstruction: z.string().min(1),
  accountNumber:      z.string().min(1),
  accountName:        z.string().min(1),
  bankName:           z.string().min(1),
  reviewedBy:         optionalId,
  approvedBy:         optionalId,
  copiedTo:           z.array(objectId).optional(),
});

export const createPaymentRequestSchema = paymentRequestBase.extend({
  reviewedBy: objectId,
});
export const savePaymentRequestDraftSchema = paymentRequestBase;

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT VOUCHER
// ═══════════════════════════════════════════════════════════════════════════════
const paymentVoucherBase = z.object({
  payingStation:                z.string().min(1),
  payTo:                        z.string().min(1),
  being:                        z.string().min(1),
  pvDate:                       z.string().min(1),
  amountInWords:                z.string().min(1),
  accountCode:                  z.string().min(1),
  projectCode:                  z.string().min(1),
  project:                      z.string().min(1),
  grossAmount:                  z.number().min(0),
  vat:                          z.number().min(0).optional(),
  wht:                          z.number().min(0).optional(),
  devLevy:                      z.number().min(0).optional(),
  otherDeductions:              z.number().min(0).optional(),
  netAmount:                    z.number().min(0),
  chartOfAccountCategories:     z.string().min(1),
  organisationalChartOfAccount: z.string().min(1),
  chartOfAccountCode:           z.string().min(1),
  note:                         z.string().optional(),
  reviewedBy:                   optionalId,
  approvedBy:                   optionalId,
  copiedTo:                     z.array(objectId).optional(),
});

export const createPaymentVoucherSchema = paymentVoucherBase.extend({
  reviewedBy: objectId,
});
export const savePaymentVoucherDraftSchema = paymentVoucherBase;

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE REQUEST
// ═══════════════════════════════════════════════════════════════════════════════
const purchaseRequestBase = z.object({
  department:          z.string().min(1),
  suggestedSupplier:   z.string().min(1),
  address:             z.string().min(1),
  finalDeliveryPoint:  z.string().min(1),
  city:                z.string().min(1),
  periodOfActivity:    dateRange,
  activityDescription: z.string().optional(),
  expenseChargedTo:    z.string().min(1),
  accountCode:         z.string().min(1),
  project:             optionalId,
  itemGroups:          z.array(itemGroupSchema).min(1),
  financeReviewBy:     optionalId,
  procurementReviewBy: optionalId,
  approvedBy:          optionalId,
  copiedTo:            z.array(objectId).optional(),
});

export const createPurchaseRequestSchema = purchaseRequestBase.extend({
  financeReviewBy:     objectId,
  procurementReviewBy: objectId,
});
export const savePurchaseRequestDraftSchema = purchaseRequestBase;

export const purchaseRequestStatusSchema = z.object({
  status:                  z.string().optional(),
  comment:                 z.string().optional(),
  approvedBy:              optionalId,
  financeReviewStatus:     z.enum(['pending', 'approved', 'rejected']).optional(),
  procurementReviewStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// RFQ
// ═══════════════════════════════════════════════════════════════════════════════
const rfqItemSchema = z.object({
  description: z.string().min(1),
  itemName:    z.string().optional(),
  frequency:   z.number().int().min(1),
  quantity:    z.number().int().min(1),
  unit:        z.string().optional(),
  unitCost:    z.number().min(0).optional(),
  total:       z.number().min(0).optional(),
});

export const createRFQSchema = z.object({
  rfqTitle:        z.string().min(1).optional(),
  itemGroups:      z.array(rfqItemSchema).min(1),
  copiedTo:        z.array(objectId).optional(),
  deadlineDate:    z.string().optional(),
  rfqDate:         z.string().optional(),
  casfodAddressId: z.string().optional(),
});

export const sendRFQSchema = z.object({
  recipients: z.array(objectId).min(1, 'At least one vendor required'),
  // Was missing — if `validate` reassigns req.body to the parsed result
  // (the normal pattern for Zod middleware), any fileIds the frontend
  // sent were being silently dropped since Zod strips unrecognized keys
  // by default. Mirrors sendPOSchema below.
  fileIds: z.array(objectId).min(1, 'At least one file required'),
});

export const updateRFQStatusSchema = z.object({
  status: z.enum(['draft', 'sent', 'cancelled']),
});

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDER
// ═══════════════════════════════════════════════════════════════════════════════
const poItemSchema = z.object({
  description: z.string().optional(),
  itemName:    z.string().optional(),
  frequency:   z.number().int().min(1),
  quantity:    z.number().int().min(1),
  unit:        z.string().optional(),
  unitCost:    z.number().min(0),
  total:       z.number().min(0),
});

export const createPOFromRFQSchema = z.object({
  itemGroups:      z.array(poItemSchema).min(1),
  approvedBy:      optionalId,
  deliveryDate:    z.string().optional(),
  poDate:          z.string().optional(),
  casfodAddressId: z.string().optional(),
  vat:             z.number().min(0).optional(),
});

export const createIndependentPOSchema = z.object({
  rfqTitle:        z.string().min(1),
  selectedVendor:  objectId,
  approvedBy:      optionalId,
  itemGroups:      z.array(poItemSchema).min(1),
  copiedTo:        z.array(objectId).optional(),
  deliveryDate:    z.string().min(1),
  poDate:          z.string().min(1),
  casfodAddressId: z.string().min(1),
  vat:             z.number().min(0),
});

export const updatePOStatusSchema = z.object({
  status:  z.enum(['pending', 'approved', 'rejected']),
  comment: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDER - Send to vendor
// ═══════════════════════════════════════════════════════════════════════════════
export const sendPOSchema = z.object({
  vendorId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid vendor ID'),
  fileIds: z.array(z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid file ID')).min(1, 'At least one file required'),
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOODS RECEIVED
// ═══════════════════════════════════════════════════════════════════════════════
const grnItemSchema = z.object({
  itemId:         z.string().min(1),
  numberOrdered:  z.number().int().min(0),
  numberReceived: z.number().int().min(0),
});

export const createGRNSchema = z.object({
  purchaseOrder: objectId,
  grnItems:      z.array(grnItemSchema).min(1),
});

// ═══════════════════════════════════════════════════════════════════════════════
// LEAVE
// ═══════════════════════════════════════════════════════════════════════════════
export const createLeaveSchema = z.object({
  leaveType:          z.enum([
    'Annual leave', 'Compassionate leave', 'Sick leave', 'Maternity leave',
    'Paternity leave', 'Emergency leave', 'Study Leave', 'Leave without pay',
  ]),
  startDate:          z.coerce.date(),
  endDate:            z.coerce.date(),
  reasonForLeave:     z.string().min(1),
  approvedBy:         optionalId,
  contactDuringLeave: z.string().optional(),
  leaveCover: z.object({
    nameOfCover: z.string().optional(),
    signature:   z.string().optional(),
  }).optional(),
  copiedTo: z.array(objectId).optional(),
});

export const saveLeaveDraftSchema = createLeaveSchema
  .omit({ approvedBy: true })
  .extend({ approvedBy: optionalId });

// ═══════════════════════════════════════════════════════════════════════════════
// STAFF STRATEGY
// ═══════════════════════════════════════════════════════════════════════════════
const objectiveSchema = z.object({
  objective:          z.string().min(1),
  timeline:           z.string().optional(),
  expectedOutcome:    z.string().min(1),
  kpi:                z.string().min(1),
  possibleChallenges: z.string().optional(),
  supportRequired:    z.string().optional(),
});

const accountabilityAreaSchema = z.object({
  areaName:   z.string().min(1),
  objectives: z.array(objectiveSchema).min(1),
});

export const createStaffStrategySchema = z.object({
  // jobTitle/supervisor are NOT accepted from the client — jobTitle is
  // display-only (read from the staff member's profile), and the
  // supervisor reference is `approvedBy`, set below.
  department:          z.string().min(1),
  period:              z.string().min(1),
  accountabilityAreas: z.array(accountabilityAreaSchema).min(1),
  approvedBy:          optionalId,
  copiedTo:            z.array(objectId).optional(),
});

export const staffStrategyStatusSchema = z.object({
  status:  z.enum(['pending', 'approved', 'rejected']),
  comment: z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// APPRAISAL
// ═══════════════════════════════════════════════════════════════════════════════
// domain.validator.ts - Update createAppraisalSchema

export const createAppraisalSchema = z.object({
  // staffName and position are NOT needed - derived from user
  // supervisorName is NOT needed - derived from supervisorId
  department:             z.string().min(1),
  lengthOfTimeInPosition: z.string().optional(),
  appraisalPeriod:        z.string().min(1),
  supervisorId:           objectId,
  lengthOfTimeSupervised: z.string().optional(),
  staffStrategy:          optionalId,
  objectives:             z.array(z.object({
    objective: z.string(),
    employeeRating: z.object({
      rating: z.enum(['', 'Achieved', 'Partly Achieved', 'Not Achieved']).optional(),
      achievements: z.string().optional(),
    }).optional(),
    supervisorRating: z.enum(['', 'Achieved', 'Partly Achieved', 'Not Achieved']).optional(),
  })).optional(),
  safeguarding: z.object({
    actionsTaken:       z.string().optional(),
    trainingCompleted:  z.enum(['Yes', 'Partly', 'No']).optional(),
    areasNotUnderstood: z.array(z.string()).optional(),
  }).optional(),
  performanceAreas: z.array(z.object({
    area: z.string(),
    rating: z.enum(['Pending', 'Needs Improvement', 'Meets Expectations', 'Exceeds Expectations']),
  })).optional(),
  supervisorComments: z.string().optional(),
  overallRating: z.enum(['Pending', 'Meets Requirements', 'Partly Meets Requirements', 'Does Not Meet Requirements']).optional(),
  futureGoals: z.string().optional(),
});

export const appraisalStatusSchema = z.object({
  status:  z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
});

export const updateObjectivesSchema = z.object({
  objectives: z.array(z.object({
    _id:           z.string().optional(),
    employeeRating: z.any().optional(),
    supervisorRating: z.string().optional(),
  })).min(1),
});

export const signAppraisalSchema = z.object({
  signatureType: z.enum(['staff', 'supervisor']),
  comments:      z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT
// ═══════════════════════════════════════════════════════════════════════════════
export const createProjectSchema = z.object({
  projectTitle:        z.string().min(1).max(200),
  donor:               z.string().min(1).max(50),
  projectPartners:     z.array(z.string()).optional(),
  projectCode:         z.string().min(1).max(50),
  implementationPeriod: z.object({ from: z.string(), to: z.string() }),
   projectBudget: z.coerce.number().min(0),
  
  // For nested arrays with numbers
  sectors: z.array(z.object({
    name: z.enum(['Education', 'Protection', 'WASH', 'Nutrition/Health', 'Livelihood']),
    percentage: z.coerce.number().min(0).max(100), // 👈 coerce here too
  })).optional(),
  milestones: z.array(
    z.object({
      title: z.string().min(1, "Milestone title is required").max(200),
      description: z.string().min(1, "Milestone description is required").max(1000),
      status: z.enum(['pending', 'active', 'completed']).optional().default('pending'),
    })
  ).optional().default([]),
  accountCodes:        z.array(z.object({ name: z.string() })).optional(),
  projectLocations:    z.array(z.string()).optional(),
  targetBeneficiaries: z.array(z.string()).optional(),
  projectObjectives:   z.string().min(1).max(400),
  projectSummary:      z.string().min(1).max(4000),
  status: z.enum(['ongoing', 'completed', 'cancelled']).optional().default('ongoing'),
});

// ═══════════════════════════════════════════════════════════════════════════════
// VENDOR
// ═══════════════════════════════════════════════════════════════════════════════
// domain.validator.ts - Make vendorCode optional

export const createVendorSchema = z.object({
  businessName:        z.string().min(1),
  businessType:        z.string().min(1),
  businessRegNumber:   z.string().min(1),
  businessState:       z.string().min(1),
  operatingLga:        z.string().optional(),
  accountNumber:       z.string().min(1),
  accountName:         z.string().min(1),
  bankName:            z.string().min(1),
  address:             z.string().min(1),
  email:               z.string().email(),
  businessPhoneNumber: z.string().length(11, 'Must be 11 digits'),
  contactPhoneNumber:  z.string().length(11, 'Must be 11 digits'),
  categories:          z.array(z.string().min(1)).min(1),
  contactPerson:       z.string().min(1),
  position:            z.string().min(1),
  // 👇 Make vendorCode optional - the model will auto-generate it
  vendorCode:          z.string().optional(),
  tinNumber:           z.string().min(1),
  // 👇 approvedBy should be an optional string ID
  approvedBy:          z.string().optional(),
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
export const updateSystemSettingsSchema = z.object({
  globalEmploymentInfoLock: z.boolean(),
});

// src/validators/domain.validator.ts - Add these

// ─── REPORT ──────────────────────────────────────────────────────────────────
const reportBase = z.object({
  activityType: z.enum(['Workshop', 'Training', 'Sector Meeting', 'Other']),
  otherActivitySpecification: z.string().optional(),
  reportType: z.enum(['Weekly Report', 'Monthly Report', 'Quarterly Report', 'Annual Report', 'Activity report']),
  reportTitle: z.string().min(1, 'Report title is required').max(200),
  reportingPeriod: z.object({
    from: z.string().min(1, 'Start date is required'),
    to: z.string().min(1, 'End date is required'),
  }),
  project: optionalId,
  reviewedBy: optionalId,
  approvedBy: optionalId,
  copiedTo: z.array(objectId).optional(),
});

export const createReportSchema = reportBase.extend({
  reviewedBy: objectId,
});

export const saveReportDraftSchema = reportBase;

// ─── Report Status Update ────────────────────────────────────────────────────
export const reportStatusUpdateSchema = z.object({
  status: z.enum(['draft', 'pending', 'reviewed', 'approved', 'rejected']),
  comment: z.string().optional(),
  approvedBy: optionalId,
});