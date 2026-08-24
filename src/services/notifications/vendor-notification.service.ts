// src/services/vendor-notification.service.ts

import { env } from '../../config/env';
import { emailService } from '../email.service';
import { CurrentUser } from '../shared/types';

// Helper function to generate the correct vendor URL
function getVendorUrl(vendorId: string): string {
  const baseUrl = (env.FRONTEND_URL).replace(/\/$/, '');
  return `${baseUrl}/procurement/vendor-management/vendor/${vendorId}`;
}

/**
 * Send vendor approval/rejection notification to the vendor
 */
export async function notifyVendorStatusChange(
  vendor: any,
  status: 'approved' | 'rejected',
  currentUser: CurrentUser,
  comment?: string
): Promise<void> {
  try {
    // Skip if vendor has no email
    if (!vendor.email) return;

    const isApproved = status === 'approved';
    const vendorUrl = getVendorUrl(vendor._id.toString());

    const subject = isApproved
      ? `Vendor Registration Approved - ${vendor.vendorCode}`
      : `Vendor Registration Update - ${vendor.businessName}`;

    const html = `
      <h2 style="color: ${isApproved ? '#059669' : '#dc2626'};">
        ${isApproved ? '✅ Vendor Registration Approved' : '❌ Vendor Registration Rejected'}
      </h2>
      <p>Dear ${vendor.contactPerson || 'Vendor'},</p>
      <p>${isApproved
        ? `We are pleased to inform you that your vendor registration for <strong>${vendor.businessName}</strong> has been approved.`
        : `We regret to inform you that your vendor registration for <strong>${vendor.businessName}</strong> has been rejected.`
      }</p>

      <div style="background: #f8fafc; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <p><strong>Business Name:</strong> ${vendor.businessName}</p>
        <p><strong>Vendor Code:</strong> ${vendor.vendorCode}</p>
        <p><strong>Status:</strong> ${isApproved ? '✅ APPROVED' : '❌ REJECTED'}</p>
        ${vendor.approvedBy ? `<p><strong>Reviewed By:</strong> ${currentUser.firstName} ${currentUser.lastName}</p>` : ''}
        ${comment ? `<p><strong>Comment:</strong> ${comment}</p>` : ''}
      </div>

      ${isApproved ? `
        <p>You can now be selected for purchase orders and RFQs. Please ensure your contact information is up to date.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${vendorUrl}" style="display:inline-block;padding:11px 24px;background:#1373B0;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">View Vendor Profile</a>
        </div>
      ` : `
        <p>If you have any questions, please contact our procurement team.</p>
      `}

      <p style="color: #666; font-size: 12px; margin-top: 24px;">
        This is an automated notification from CASFOD Procurement System.
      </p>
    `;

    await emailService.sendCustomEmail(
      vendor.email,
      subject,
      html
    );

    console.log(`✅ Vendor ${status} notification sent to: ${vendor.email}`);
    console.log(`🔗 Vendor URL: ${vendorUrl}`);
  } catch (error) {
    console.error(`Failed to send vendor ${status} notification:`, error);
    // Don't throw - notifications are best-effort
  }
}

/**
 * Send vendor welcome email with vendor code
 */
export async function sendVendorWelcomeEmail(vendor: any): Promise<void> {
  try {
    if (!vendor.email) return;

    const vendorUrl = getVendorUrl(vendor._id.toString());

    const html = `
      <h2 style="color: #1373B0;">Welcome to CASFOD Vendor Network</h2>
      <p>Dear ${vendor.contactPerson || 'Vendor'},</p>
      <p>We are pleased to welcome you to the CASFOD vendor network. Your vendor account has been created.</p>

      <div style="background: #f8fafc; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <p><strong>Business Name:</strong> ${vendor.businessName}</p>
        <p><strong>Vendor Code:</strong> ${vendor.vendorCode}</p>
        <p><strong>Status:</strong> ⏳ Pending Approval</p>
      </div>

      <p>You will receive another notification once your registration is reviewed and approved.</p>
      
      // <div style="text-align:center;margin:24px 0;">
      //   <a href="${vendorUrl}" style="display:inline-block;padding:11px 24px;background:#1373B0;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">View Vendor Profile</a>
      // </div>

      <p style="color: #666; font-size: 12px; margin-top: 24px;">
        This is an automated notification from CASFOD Procurement System.
      </p>
    `;

    await emailService.sendCustomEmail(
      vendor.email,
      `Vendor Registration - ${vendor.vendorCode}`,
      html
    );

    console.log(`✅ Vendor welcome email sent to: ${vendor.email}`);
    console.log(`🔗 Vendor URL: ${vendorUrl}`);
  } catch (error) {
    console.error('Failed to send vendor welcome email:', error);
  }
}