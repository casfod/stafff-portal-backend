import mongoose, { Schema, Document, Model } from 'mongoose';
import bcrypt from 'bcryptjs';
import validator from 'validator';
import { toJsonTransform } from './shared/toJson';

// ─── Sub-interfaces ───────────────────────────────────────────────────────────

export interface IRolePermissions {
  canCreate: boolean;
  canView: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface IPersonalDetails {
  fullName?: string;
  stateOfOrigin?: string;
  lga?: string;
  religion?: string;
  gender?: 'Male' | 'Female';
  address?: string;
  homePhone?: string;
  cellPhone?: string;
  emailAddress?: string;
  ninNumber?: string;
  birthDate?: Date;
  maritalStatus?: 'Single' | 'Married' | 'Divorced' | 'Widowed';
  spouseName?: string;
  spouseAddress?: string;
  spousePhone?: string;
  numberOfChildren?: number;
}

export interface IJobDetails {
  title?: string;
  idNo?: string;
  staffTaxIdNo?: string;
  workLocation?: string;
  workEmail?: string;
  workPhone?: string;
  workCellPhone?: string;
  startDate?: Date;
  endDate?: Date;
  supervisor?: string;
  supervisorId?: mongoose.Types.ObjectId;
}

export interface IEmergencyContact {
  fullName?: string;
  address?: string;
  primaryPhone?: string;
  cellPhone?: string;
  relationship?: string;
}

export interface IBankDetails {
  bankName?: string;
  accountName?: string;
  bankSortCode?: string;
  accountNumber?: string;
}

export interface IEmploymentInfo {
  isProfileComplete: boolean;
  isEmploymentInfoLocked: boolean;
  personalDetails?: IPersonalDetails;
  jobDetails?: IJobDetails;
  emergencyContact?: IEmergencyContact;
  bankDetails?: IBankDetails;
}

export interface IUserAvatar {
  url: string;
  publicId: string;
}
export interface IUserSignature {
  url: string;
  publicId: string;
}

// ─── Main Interface ───────────────────────────────────────────────────────────

export interface IUser extends Document {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  passwordConfirm?: string;
  passwordChangedAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  role: 'SUPER-ADMIN' | 'ADMIN' | 'REVIEWER' | 'STAFF';
  procurementRole: IRolePermissions;
  financeRole: IRolePermissions;
  position?: string;
  avatar: IUserAvatar;
  signature: IUserSignature;
  isActive: boolean;
  isDeleted: boolean;
  employmentInfo: IEmploymentInfo;
  createdAt: Date;
  updatedAt: Date;
  // Methods
  comparePassword(candidate: string): Promise<boolean>;
  changedPasswordAfter(jwtTimestamp: number): boolean;
  // Virtuals
  fullName: string;
}

export interface IUserModel extends Model<IUser> {}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const rolePermissionsSchema = new Schema<IRolePermissions>(
  {
    canCreate: { type: Boolean, default: false },
    canView:   { type: Boolean, default: false },
    canUpdate: { type: Boolean, default: false },
    canDelete: { type: Boolean, default: false },
  },
  { _id: false },
);

const personalDetailsSchema = new Schema<IPersonalDetails>(
  {
    fullName:        { type: String },
    stateOfOrigin:   { type: String },
    lga:             { type: String },
    religion:        { type: String },
    gender:          { type: String, enum: ['Male', 'Female'] },
    address:         { type: String },
    homePhone:       { type: String },
    cellPhone:       { type: String, unique: true, sparse: true },
    emailAddress:    { type: String },
    ninNumber:       { type: String, unique: true, sparse: true },
    birthDate:       { type: Date },
    maritalStatus:   { type: String, enum: ['Single', 'Married', 'Divorced', 'Widowed'] },
    spouseName:      { type: String },
    spouseAddress:   { type: String },
    spousePhone:     { type: String },
    numberOfChildren:{ type: Number },
  },
  { _id: false },
);

const jobDetailsSchema = new Schema<IJobDetails>(
  {
    title:         { type: String },
    idNo:          { type: String },
    staffTaxIdNo:  { type: String },
    workLocation:  { type: String },
    workEmail:     { type: String },
    workPhone:     { type: String },
    workCellPhone: { type: String },
    startDate:     { type: Date },
    endDate:       { type: Date },
    supervisor:    { type: String },
    supervisorId:  { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

const emergencyContactSchema = new Schema<IEmergencyContact>(
  {
    fullName:     { type: String },
    address:      { type: String },
    primaryPhone: { type: String },
    cellPhone:    { type: String, unique: true, sparse: true },
    relationship: { type: String },
  },
  { _id: false },
);

const bankDetailsSchema = new Schema<IBankDetails>(
  {
    bankName:      { type: String },
    accountName:   { type: String },
    bankSortCode:  { type: String },
    accountNumber: { type: String, unique: true, sparse: true },
  },
  { _id: false },
);

const employmentInfoSchema = new Schema<IEmploymentInfo>(
  {
    isProfileComplete:      { type: Boolean, default: false },
    isEmploymentInfoLocked: { type: Boolean, default: false },
    personalDetails:        personalDetailsSchema,
    jobDetails:             jobDetailsSchema,
    emergencyContact:       emergencyContactSchema,
    bankDetails:            bankDetailsSchema,
  },
  { _id: false },
);

// ─── Positions Enum ───────────────────────────────────────────────────────────

const POSITIONS = [
  '',
  'Executive Director',
  'Head of Program and Grant',
  'Supply Chain Coordinator',
  'Partnership and Reporting Coordinator',
  'Project Coordinator',
  'Education Officer',
  'Protection Officer',
  'MEAL Senior Officer',
  'MHPSS Officer',
  'Protection Coordinator',
  'Education Coordinator',
  'Nutrition Coordinator',
  'Livelihood Lead',
  'Gender and Disability Inclusion Lead',
  'Finance Officer',
  'State Head of Operation',
  'Procurement Officer',
  'Logistic and Fleet Management Officer',
  'Human Resource Coordinator',
  'Education Assistant',
  'Nutrition Manager',
  'Nutrition Assistant',
  'CMAM Provider',
  'CMAM Screener',
  'MICYN Screener',
  'CFM Officer',
  'AAP/CFM Facilitator',
  'Data Clerk',
  'GBV Case Worker',
  'GVB Case Worker',
  'MHPSS Councillor',
  'Communication Officer',
  'Safety and Security Adviser',
  'Communication Intern',
  'IT Associate',
  'Store Keeper',
  'Supply Chain Intern',
  'Finance and Admin Associate',
  'Driver',
  'Cleaner',
  'Media Officer',
  'Protection Assistant',
  'Education Associate',
  'Media Associate',
  'Protection Intern',
  'Education Volunteer',
  'Program Intern',
  'Logistic Assistant',
  'WASH Associate',
  'Media Intern',
  'MHPSS Intern',
  'Health Intern',
  'Finance Assistant',
] as const;

// ─── Schema ───────────────────────────────────────────────────────────────────

const userSchema = new Schema<IUser, IUserModel>(
  {
    firstName: {
      type: String,
      required: [true, 'First name is required'],
      trim: true,
      maxlength: [24, 'First name must have at most 24 characters'],
      minlength: [2, 'First name must have at least 2 characters'],
      validate: {
        validator: (val: string) => validator.isAlpha(val, 'en-US', { ignore: ' -' }),
        message: 'First name must only contain letters',
      },
    },
    lastName: {
      type: String,
      required: [true, 'Last name is required'],
      trim: true,
      maxlength: [24, 'Last name must have at most 24 characters'],
      minlength: [2, 'Last name must have at least 2 characters'],
      validate: {
        validator: (val: string) => validator.isAlpha(val, 'en-US', { ignore: ' -' }),
        message: 'Last name must only contain letters',
      },
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      validate: [validator.isEmail, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false,
    },
    passwordChangedAt:   { type: Date, select: false },
    passwordResetToken:  { type: String, select: false },
    passwordResetExpires:{ type: Date, select: false },

    role: {
      type: String,
      enum: ['SUPER-ADMIN', 'ADMIN', 'REVIEWER', 'STAFF'],
      default: 'STAFF',
    },

    procurementRole: { type: rolePermissionsSchema, default: () => ({}) },
    financeRole:     { type: rolePermissionsSchema, default: () => ({}) },

    position: { type: String, enum: POSITIONS },

    avatar: {
      url:      { type: String, default: '' },
      publicId: { type: String, default: '' },
    },

    signature: {
      url:      { type: String, default: '' },
      publicId: { type: String, default: '' },
    },

    isActive:  { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },

    employmentInfo: { type: employmentInfoSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    collection: 'users',
    toJSON:   { virtuals: true },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

userSchema.index({ role: 1 });
userSchema.index({ isActive: 1, isDeleted: 1 });

// ─── Virtuals ─────────────────────────────────────────────────────────────────

userSchema.virtual('fullName').get(function (this: IUser) {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.virtual('employmentInfo.isComplete').get(function (this: IUser) {
  const info = this.employmentInfo;
  if (!info) return false;
  const required = [
    info.personalDetails?.fullName,
    info.personalDetails?.stateOfOrigin,
    info.personalDetails?.lga,
    info.personalDetails?.address,
    info.personalDetails?.cellPhone,
    info.personalDetails?.ninNumber,
    info.jobDetails?.title,
    info.jobDetails?.startDate,
    info.emergencyContact?.fullName,
    info.emergencyContact?.primaryPhone,
    info.bankDetails?.bankName,
    info.bankDetails?.accountName,
    info.bankDetails?.accountNumber,
  ];
  return required.every((f) => f && f.toString().trim() !== '');
});

// ─── Hooks ────────────────────────────────────────────────────────────────────

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;
  next();
});

userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();
  this.passwordChangedAt = new Date(Date.now() - 1000);
  next();
});

// ─── Methods ──────────────────────────────────────────────────────────────────

userSchema.methods.comparePassword = async function (
  candidate: string,
): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.changedPasswordAfter = function (
  jwtTimestamp: number,
): boolean {
  if (this.passwordChangedAt) {
    const changed = Math.floor(this.passwordChangedAt.getTime() / 1000);
    return jwtTimestamp < changed;
  }
  return false;
};

// ─── toJSON ───────────────────────────────────────────────────────────────────

userSchema.set('toJSON', toJsonTransform(['password', 'passwordConfirm', 'passwordResetToken', 'passwordResetExpires']));

export const User = mongoose.model<IUser, IUserModel>('User', userSchema);