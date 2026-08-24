// src/utils/employmentInfoCompleteness.ts
export interface CompletenessCheckInput {
  personalDetails?: {
    fullName?: string; stateOfOrigin?: string; lga?: string;
    address?: string; cellPhone?: string; ninNumber?: string;
  };
  jobDetails?: { title?: string; startDate?: Date | string };
  emergencyContact?: { fullName?: string; primaryPhone?: string };
  bankDetails?: { bankName?: string; accountName?: string; accountNumber?: string };
}

export function computeEmploymentInfoComplete(info: CompletenessCheckInput): boolean {
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
}