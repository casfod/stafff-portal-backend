// services/procurementNotification.js
const nodemailer = require("nodemailer");

function formatToDDMMYYYY(dateString) {
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

class ProcurementNotificationService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.PROCUREMENT_MAIL,
        pass: process.env.PROCUREMENT_MAIL_PASSWORD,
      },
      debug: true,
    });
  }

  async sendMail(options) {
    try {
      const mailOptions = {
        from: {
          name: "CASFOD Procurement",
          address: process.env.PROCUREMENT_MAIL,
        },
        to: options.recipientEmail,
        cc: options.cc || undefined,
        bcc: options.bcc || undefined,
        subject: options.subject,
        html: options.htmlTemplate,
        attachments: options.attachments || undefined,
      };

      console.log("📧 Mail options:", {
        to: mailOptions.to,
        cc: mailOptions.cc ? `${mailOptions.cc.length} recipients` : "none",
        bcc: mailOptions.bcc ? `${mailOptions.bcc.length} recipients` : "none",
        subject: mailOptions.subject,
      });

      await this.transporter.sendMail(mailOptions);

      let logMessage = `✅ Procurement email sent to: ${options.recipientEmail}`;
      if (options.cc)
        logMessage += ` with CC to ${options.cc.length} recipients`;
      if (options.bcc)
        logMessage += ` with BCC to ${options.bcc.length} recipients`;

      console.log(logMessage);
    } catch (error) {
      console.error("Error sending procurement email:", error);
      throw new Error("Failed to send procurement email");
    }
  }

  // Generic email method with full options
  async sendGenericEmail({
    to,
    subject,
    htmlTemplate,
    cc = undefined,
    bcc = undefined,
    attachments = undefined,
  }) {
    try {
      await this.sendMail({
        recipientEmail: to,
        cc,
        bcc,
        subject,
        htmlTemplate,
        attachments,
      });
    } catch (error) {
      console.error("❌ Failed to send generic email:", error);
      throw error;
    }
  }

  // Purchase Order Notifications

  // Unified Purchase Order notification
  async sendPurchaseOrderNotification({
    vendor,
    purchaseOrder,
    currentUser,
    type = "selection", // 'selection', 'approval', or 'status'
    status,
    fileDownloads = [],
  }) {
    try {
      let subject, htmlTemplate;

      if (type === "status") {
        if (status === "approved") {
          subject = `Purchase Order Approved: ${purchaseOrder.RFQCode}`;
          htmlTemplate = this.getPOApprovalWithFilesTemplate(
            vendor,
            purchaseOrder,
            currentUser,
            fileDownloads
          );
        } else if (status === "rejected") {
          subject = `Purchase Order Update: ${purchaseOrder.RFQCode}`;
          htmlTemplate = this.getPORejectionTemplate(
            vendor,
            purchaseOrder,
            currentUser
          );
        } else {
          throw new Error("Invalid status for PO notification");
        }
      } else if (type === "selection") {
        subject = `Purchase Order Selection: ${purchaseOrder.RFQCode}`;
        htmlTemplate = this.getPOSelectionTemplate(
          vendor,
          purchaseOrder,
          currentUser
        );
      } else if (type === "approval") {
        subject = `Purchase Order Approved: ${purchaseOrder.RFQCode}`;
        htmlTemplate = this.getPOApprovalTemplate(
          vendor,
          purchaseOrder,
          currentUser
        );
      } else {
        throw new Error("Invalid PO notification type");
      }

      await this.sendMail({
        recipientEmail: vendor.email,
        subject,
        htmlTemplate,
      });

      console.log(
        `✅ PO ${type}${
          status ? ` ${status}` : ""
        } notification sent to vendor: ${vendor.businessName} with ${
          fileDownloads.length
        } files`
      );
    } catch (error) {
      console.error(
        `❌ Failed to send PO ${type} notification to ${vendor.businessName}:`,
        error
      );
      throw error;
    }
  }

  // Notify vendor about PO approval (legacy method)
  async sendPOApprovalNotification({ vendor, purchaseOrder, currentUser }) {
    return this.sendPurchaseOrderNotification({
      vendor,
      purchaseOrder,
      currentUser,
      type: "approval",
    });
  }

  // Notify vendor about PO status with file downloads
  async sendPurchaseOrderStatusNotification({
    vendor,
    purchaseOrder,
    currentUser,
    status,
    fileDownloads = [],
  }) {
    return this.sendPurchaseOrderNotification({
      vendor,
      purchaseOrder,
      currentUser,
      type: "status",
      status,
      fileDownloads,
    });
  }

  // Send PO with PDF attachment to vendor
  async sendPOWithAttachment({
    vendor,
    purchaseOrder,
    currentUser,
    pdfBuffer,
    cc = undefined,
    bcc = undefined,
  }) {
    try {
      const subject = `Purchase Order: ${purchaseOrder.RFQCode}`;

      const htmlTemplate = this.getPOAttachmentTemplate(
        vendor,
        purchaseOrder,
        currentUser
      );

      await this.sendMail({
        recipientEmail: vendor.email,
        cc,
        bcc,
        subject,
        htmlTemplate,
        attachments: [
          {
            filename: `PO-${purchaseOrder.RFQCode}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      console.log(
        `✅ PO ${purchaseOrder.RFQCode} with attachment sent to: ${vendor.businessName}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to send PO with attachment to ${vendor.businessName}:`,
        error
      );
      throw error;
    }
  }

  // RFQ Notifications

  // Unified RFQ notification method
  async sendRFQNotification({
    vendor,
    vendors,
    rfq,
    currentUser,
    fileDownloads = [],
    cc = undefined,
    bcc = undefined,
  }) {
    try {
      const subject = `Request for Quotation: ${rfq.RFQCode}`;

      let htmlTemplate;
      let recipientEmail;
      let bccEmails;

      // Determine if this is a single vendor or BCC notification
      if (vendors && vendors.length > 0) {
        // BCC notification to multiple vendors
        const primaryVendor = vendors[0];
        bccEmails = vendors.map((vendor) => vendor.email);
        recipientEmail = process.env.PROCUREMENT_MAIL; // Send to ourselves
        htmlTemplate = this.getRFQTemplateWithMultipleFiles(
          primaryVendor,
          rfq,
          currentUser,
          fileDownloads
        );
      } else if (vendor) {
        // Single vendor notification
        recipientEmail = vendor.email;
        htmlTemplate = this.getRFQTemplateWithMultipleFiles(
          vendor,
          rfq,
          currentUser,
          fileDownloads
        );
      } else {
        throw new Error("Either vendor or vendors must be provided");
      }

      await this.sendMail({
        recipientEmail,
        cc,
        bcc: bccEmails || bcc,
        subject,
        htmlTemplate,
      });

      const vendorCount = vendors ? vendors.length : 1;
      console.log(
        `✅ RFQ ${rfq.RFQCode} sent to ${vendorCount} vendor(s) with ${fileDownloads.length} files`
      );
    } catch (error) {
      console.error(`❌ Failed to send RFQ notification:`, error);
      throw error;
    }
  }

  // RFQ notification with BCC (Primary for vendor communications)
  async sendRFQNotificationWithBCC({
    vendors,
    rfq,
    currentUser,
    fileDownloads = [],
  }) {
    return this.sendRFQNotification({
      vendors,
      rfq,
      currentUser,
      fileDownloads,
    });
  }

  // Send RFQ with PDF attachment to vendor
  async sendRFQWithAttachment({
    vendor,
    rfq,
    currentUser,
    pdfBuffer,
    cc = undefined,
    bcc = undefined,
  }) {
    try {
      const subject = `Request for Quotation: ${rfq.RFQCode}`;

      const htmlTemplate = this.getRFQAttachmentTemplate(
        vendor,
        rfq,
        currentUser
      );

      await this.sendMail({
        recipientEmail: vendor.email,
        cc,
        bcc,
        subject,
        htmlTemplate,
        attachments: [
          {
            filename: `RFQ-${rfq.RFQCode}.pdf`,
            content: pdfBuffer,
            contentType: "application/pdf",
          },
        ],
      });

      console.log(
        `✅ RFQ ${rfq.RFQCode} with attachment sent to: ${vendor.businessName}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to send RFQ with attachment to ${vendor.businessName}:`,
        error
      );
      throw error;
    }
  }

  // Template generators for Purchase Orders

  getPOSelectionTemplate(vendor, purchaseOrder, currentUser) {
    const totalAmount = purchaseOrder.totalAmount?.toLocaleString() || "0";

    return `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #333333; padding: 40px; max-width: 600px; margin: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px;">
        <h1 style="color: #1373B0; margin: 0 0 8px 0; font-size: 22px; font-weight: 600; line-height: 1.3;">
          Purchase Order Selection
        </h1>
        <p style="font-size: 15px; color: #4b5563; margin: 0;">
          <strong>PO Code:</strong> ${purchaseOrder.RFQCode}
        </p>
      </div>
    
      <div style="margin-bottom: 16px;">
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          <strong style="color: #4b5563;">Congratulations ${
            vendor.contactPerson || "Vendor"
          },</strong>
        </p>
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          Your bid has been selected for the following Purchase Order from CASFOD.
        </p>
      </div>

      <!-- PO Details -->
      <div style="margin-bottom: 24px; padding: 16px; background-color: #f0f9ff; border-radius: 6px; border-left: 4px solid #1373B0;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #1373B0;">Purchase Order Details</h3>
        <div style="font-size: 14px; color: #4b5563;">
          <p style="margin: 4px 0;"><strong>PO Code:</strong> ${
            purchaseOrder.RFQCode
          }</p>
          <p style="margin: 4px 0;"><strong>Title:</strong> ${
            purchaseOrder.RFQTitle
          }</p>
          <p style="margin: 4px 0;"><strong>Delivery Date:</strong> ${
            formatToDDMMYYYY(purchaseOrder.deliveryDate) || "N/A"
          }</p>
          <p style="margin: 4px 0;"><strong>Total Amount:</strong> ₦${totalAmount}</p>
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          Our procurement team will contact you shortly to proceed with the next steps. Please ensure you have all necessary documentation ready.
        </p>
      </div>

      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
          This is an automated notification from CASFOD Procurement System. 
        </p>
      </div>
    </div>
    `;
  }

  getPOApprovalTemplate(vendor, purchaseOrder, currentUser) {
    const totalAmount = purchaseOrder.totalAmount?.toLocaleString() || "0";

    return `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #333333; padding: 40px; max-width: 600px; margin: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px;">
        <h1 style="color: #10b981; margin: 0 0 8px 0; font-size: 22px; font-weight: 600; line-height: 1.3;">
          Purchase Order Approved
        </h1>
        <p style="font-size: 15px; color: #4b5563; margin: 0;">
          <strong>PO Code:</strong> ${purchaseOrder.RFQCode}
        </p>
      </div>
    
      <div style="margin-bottom: 16px;">
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          <strong style="color: #4b5563;">Hello ${
            vendor.contactPerson || "Vendor"
          },</strong>
        </p>
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          We are pleased to inform you that the following Purchase Order has been officially approved and is ready for processing.
        </p>
      </div>

      <!-- Approved PO Details -->
      <div style="margin-bottom: 24px; padding: 16px; background-color: #f0fdf4; border-radius: 6px; border-left: 4px solid #10b981;">
        <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #10b981;">Approved Purchase Order</h3>
        <div style="font-size: 14px; color: #4b5563;">
          <p style="margin: 4px 0;"><strong>PO Code:</strong> ${
            purchaseOrder.RFQCode
          }</p>
          <p style="margin: 4px 0;"><strong>Title:</strong> ${
            purchaseOrder.RFQTitle
          }</p>
          <p style="margin: 4px 0;"><strong>Delivery Date:</strong> ${
            formatToDDMMYYYY(purchaseOrder.deliveryDateformatToDDMMYYYY) ||
            "N/A"
          }</p>
          <p style="margin: 4px 0;"><strong>Total Amount:</strong> ₦${totalAmount}</p>
          <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: #10b981; font-weight: 600;">APPROVED</span></p>
        </div>
      </div>

      <div style="margin-bottom: 24px;">
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          Please proceed with the delivery of goods/services as per the agreed terms. The official Purchase Order document will be sent to you separately.
        </p>
      </div>

      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
          This is an automated notification from CASFOD Procurement System. 
        </p>
      </div>
    </div>
    `;
  }

  getPOAttachmentTemplate(vendor, purchaseOrder, currentUser) {
    return `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #333333; padding: 40px; max-width: 600px; margin: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px;">
        <h1 style="color: #1373B0; margin: 0 0 8px 0; font-size: 22px; font-weight: 600; line-height: 1.3;">
          Purchase Order
        </h1>
        <p style="font-size: 15px; color: #4b5563; margin: 0;">
          <strong>PO Code:</strong> ${purchaseOrder.RFQCode}
        </p>
      </div>
      
      <div style="margin-bottom: 16px;">
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          <strong style="color: #4b5563;">Hello ${vendor.contactPerson},</strong>
        </p>
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          Please find the attached official Purchase Order document. We look forward to your prompt delivery of the requested goods/services.
        </p>
      </div>

      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
          This is an automated notification from CASFOD Procurement System.
        </p>
      </div>
    </div>
    `;
  }

  // Template for PO approval with multiple files
  getPOApprovalWithFilesTemplate(
    vendor,
    purchaseOrder,
    currentUser,
    fileDownloads = []
  ) {
    const totalAmount = purchaseOrder.totalAmount?.toLocaleString() || "0";

    const filesHtml = fileDownloads
      .map(
        (file) => `
  <table style="width: 100%; margin-bottom: 12px; background-color: #f8fafc; border-radius: 4px; border-left: 3px solid #10b981;" cellpadding="0" cellspacing="0">
    <tr>
      <td style="padding: 12px; width: 75%; vertical-align: top;">
        <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 500; color: #374151; word-break: break-word;">
          ${file.name}
        </p>
        <p style="margin: 0; font-size: 12px; color: #6b7280;">
          ${this.formatFileType(file.fileType)} • ${this.formatFileSize(
          file.size
        )}
        </p>
      </td>
      <td style="padding: 12px; width: 25%; vertical-align: middle; text-align: right;">
        <a href="${file.url}" 
          style="display: inline-block; padding: 8px 16px; background-color: #10b981; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 500; border-radius: 4px; transition: background-color 0.2s; white-space: nowrap;">
          Download
        </a>
      </td>
    </tr>
  </table>
`
      )
      .join("");

    return `
<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #333333; padding: 40px; max-width: 600px; margin: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
  <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px;">
    <h1 style="color: #10b981; margin: 0 0 8px 0; font-size: 22px; font-weight: 600; line-height: 1.3;">
      Purchase Order Approved
    </h1>
    <p style="font-size: 15px; color: #4b5563; margin: 0;">
      <strong>PO Code:</strong> ${purchaseOrder.RFQCode}
    </p>
  </div>

  <div style="margin-bottom: 16px;">
    <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
      <strong style="color: #4b5563;">Hello Vendor, </strong>
    </p>
    <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
      We are pleased to inform you that the following Purchase Order has been officially approved and is ready for processing.
    </p>
  </div>

  <!-- Approved PO Details -->
  <div style="margin-bottom: 24px; padding: 16px; background-color: #f0fdf4; border-radius: 6px; border-left: 4px solid #10b981;">
    <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #10b981;">Approved Purchase Order</h3>
    <div style="font-size: 14px; color: #4b5563;">
      <p style="margin: 4px 0;"><strong>PO Code:</strong> ${
        purchaseOrder.RFQCode
      }</p>
      <p style="margin: 4px 0;"><strong>Title:</strong> ${
        purchaseOrder.RFQTitle
      }</p>
      <p style="margin: 4px 0;"><strong>Delivery Date:</strong> ${
        formatToDDMMYYYY(purchaseOrder.deliveryDate) || "N/A"
      }</p>
      <p style="margin: 4px 0;"><strong>Total Amount:</strong> ₦${totalAmount}</p>
      <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: #10b981; font-weight: 600;">APPROVED</span></p>
    </div>
  </div>

  <!-- Files Section for Approved PO -->
  ${
    fileDownloads.length > 0
      ? `
  <div style="margin-bottom: 24px;">
    <p style="margin: 0 0 12px 0; font-size: 14px; color: #4b5563;">
      <strong>Download Purchase Order Documents:</strong>
    </p>
    ${filesHtml}
    <p style="margin: 12px 0 0 0; font-size: 12px; color: #6b7280;">
      <em>If files don't download automatically, right-click the links and select "Save link as..."</em>
    </p>
  </div>
  `
      : ""
  }

  <div style="margin-bottom: 24px;">
    <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
     <strong>Kindly sign the PO and wait for the countersigned version before proceeding with the delivery of Goods/Services as per the agreed terms. </strong>
    </p>
  </div>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
    <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
      This is an automated notification from CASFOD Procurement System. 
    </p>
  </div>
</div>
`;
  }

  // Template for PO rejection (no files)
  getPORejectionTemplate(vendor, purchaseOrder, currentUser) {
    return `
<div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #333333; padding: 40px; max-width: 600px; margin: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
  <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px;">
    <h1 style="color: #ef4444; margin: 0 0 8px 0; font-size: 22px; font-weight: 600; line-height: 1.3;">
      Purchase Order Update
    </h1>
    <p style="font-size: 15px; color: #4b5563; margin: 0;">
      <strong>PO Code:</strong> ${purchaseOrder.RFQCode}
    </p>
  </div>

  <div style="margin-bottom: 16px;">
    <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
      <strong style="color: #4b5563;">Hello Vendor, </strong>
    </p>
    <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
      We regret to inform you that the following Purchase Order has been rejected.
    </p>
  </div>

  <!-- Rejected PO Details -->
  <div style="margin-bottom: 24px; padding: 16px; background-color: #fef2f2; border-radius: 6px; border-left: 4px solid #ef4444;">
    <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #ef4444;">Purchase Order Details</h3>
    <div style="font-size: 14px; color: #4b5563;">
      <p style="margin: 4px 0;"><strong>PO Code:</strong> ${purchaseOrder.RFQCode}</p>
      <p style="margin: 4px 0;"><strong>Title:</strong> ${purchaseOrder.RFQTitle}</p>
      <p style="margin: 4px 0;"><strong>Status:</strong> <span style="color: #ef4444; font-weight: 600;">REJECTED</span></p>
    </div>
  </div>

  <div style="margin-bottom: 24px;">
    <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
      Our procurement team may contact you for future opportunities. Thank you for your understanding.
    </p>
  </div>

  <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
    <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
      This is an automated notification from CASFOD Procurement System. 
    </p>
  </div>
</div>
`;
  }

  // RFQ Template generators

  getRFQAttachmentTemplate(vendor, rfq, currentUser) {
    return `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #333333; padding: 40px; max-width: 600px; margin: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px;">
        <h1 style="color: #1373B0; margin: 0 0 8px 0; font-size: 22px; font-weight: 600; line-height: 1.3;">
          Request for Quotation
        </h1>
        <p style="font-size: 15px; color: #4b5563; margin: 0;">
          <strong>RFQ Code:</strong> ${rfq.RFQCode}
        </p>
      </div>
      
      <div style="margin-bottom: 16px;">
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          <strong style="color: #4b5563;">Hello ${vendor.contactPerson},</strong>
        </p>
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          Please find the attached Request for Quotation document. We look forward to receiving your bid.
        </p>
      </div>

      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
          This is an automated notification from CASFOD Procurement System.
        </p>
      </div>
    </div>
    `;
  }

  // Template for RFQ with multiple files
  getRFQTemplateWithMultipleFiles(
    vendor,
    rfq,
    currentUser,
    fileDownloads = []
  ) {
    const filesHtml = fileDownloads
      .map(
        (file) => `
    <table style="width: 100%; margin-bottom: 12px; background-color: #f8fafc; border-radius: 4px; border-left: 3px solid #1373B0;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding: 12px; width: 75%; vertical-align: top;">
          <p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 500; color: #374151; word-break: break-word;">
            ${file.name}
          </p>
          <p style="margin: 0; font-size: 12px; color: #6b7280;">
            ${this.formatFileType(file.fileType)} • ${this.formatFileSize(
          file.size
        )}
          </p>
        </td>
        <td style="padding: 12px; width: 25%; vertical-align: middle; text-align: right;">
          <a href="${file.url}" 
            style="display: inline-block; padding: 8px 16px; background-color: #1373B0; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 500; border-radius: 4px; transition: background-color 0.2s; white-space: nowrap;">
            Download
          </a>
        </td>
      </tr>
    </table>
  `
      )
      .join("");

    return `
  <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #333333; padding: 40px; max-width: 600px; margin: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
    
    <!-- Header Section -->
    <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px;">
      <h1 style="color: #1373B0; margin: 0 0 8px 0; font-size: 22px; font-weight: 600; line-height: 1.3;">
        CASFOD Request for Quotation
      </h1>
      <p style="font-size: 15px; color: #4b5563; margin: 0;">
        <strong>RFQ Code:</strong> ${rfq.RFQCode}
      </p>
    </div>
  
    <!-- Greeting Section -->
    <div style="margin-bottom: 16px;">
      <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
        <strong style="color: #4b5563;">Hello Vendor</strong>
      </p>
      <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
        You have been invited to submit a bid for the following quotation from CASFOD.
      </p>
    </div>

    <!-- Files Section -->
    <div style="margin-bottom: 24px;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #4b5563;">
        <strong>Download RFQ Documents:</strong>
      </p>
      ${
        fileDownloads.length > 0
          ? filesHtml
          : `
        <p style="font-size: 14px; color: #6b7280; font-style: italic;">
          No documents available for download.
        </p>
      `
      }
      ${
        fileDownloads.length > 0
          ? `
        <p style="margin: 12px 0 0 0; font-size: 12px; color: #6b7280;">
          <em>If files don't download automatically, right-click the links and select "Save link as..."</em>
        </p>
      `
          : ""
      }
    </div>

    <!-- Footer Section -->
    <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
      <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
        This is an automated notification from CASFOD Procurement System. 
      </p>
    </div>
  </div>
  `;
  }

  // Helper method to format file type
  formatFileType(fileType) {
    const typeMap = {
      pdf: "PDF Document",
      image: "Image",
      document: "Word Document",
      spreadsheet: "Excel Spreadsheet",
      text: "Text File",
      archive: "Archive",
    };
    return typeMap[fileType] || fileType || "File";
  }

  // Helper method to format file size
  formatFileSize(bytes) {
    if (!bytes) return "Unknown size";

    const sizes = ["Bytes", "KB", "MB", "GB"];
    if (bytes === 0) return "0 Bytes";

    const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + " " + sizes[i];
  }
}

module.exports = new ProcurementNotificationService();
