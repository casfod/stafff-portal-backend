// ─── Shared schemas & utilities (re-exported for consumers) ──────────────────
export { commentSchema, IComment }               from './shared/comment.schema';
export { itemGroupSchema, expenseItemSchema,
         IItemGroup, IExpenseItem }              from './shared/itemGroup.schema';
export { toJsonTransform }                       from './shared/toJson';

// ─── Models ───────────────────────────────────────────────────────────────────
export { User, IUser, IUserModel,
         IRolePermissions, IEmploymentInfo,
         IPersonalDetails, IJobDetails,
         IEmergencyContact, IBankDetails,
         IUserAvatar }                           from './User.model';

export { File, IFile }                           from './File.model';

export { Project, IProject,
         ISector, IAccountCode }                 from './Project.model';

export { Vendor, IVendor }                       from './Vendor.model';

export { SystemSettings, ISystemSettings }       from './SystemSettings.model';

export { ConceptNote, IConceptNote,
         WorkflowStatus }                        from './ConceptNote.model';

export { AdvanceRequest, IAdvanceRequest }       from './AdvanceRequest.model';

export { PurchaseRequest, IPurchaseRequest,
         ReviewDecision }                        from './PurchaseRequest.model';

export { RFQ, IRFQ, RFQStatus }                 from './RFQ.model';

export { PurchaseOrder, IPurchaseOrder }         from './PurchaseOrder.model';

export { GoodsReceived, IGoodsReceived,
         IGRNItem }                              from './GoodsReceived.model';

export { PaymentRequest, IPaymentRequest }       from './PaymentRequest.model';

export { PaymentVoucher, IPaymentVoucher,
         PaymentVoucherStatus }                  from './PaymentVoucher.model';

export { ExpenseClaims, IExpenseClaim }          from './ExpenseClaims.model';

export { TravelRequest, ITravelRequest }         from './TravelRequest.model';

export { LeaveBalance, ILeaveBalance,
         ILeaveTypeBalance }                     from './LeaveBalance.model';

export { Leave, ILeave, LeaveType }              from './Leave.model';

export { StaffStrategy, IStaffStrategy,
         IAccountabilityArea, IObjective }       from './StaffStrategy.model';

export { Appraisal, IAppraisal,
         AppraisalStatus, OverallRating,
         ObjectiveRating, PerformanceRating }    from './Appraisal.model';
export { Report, IReport }    from './Report.model';
