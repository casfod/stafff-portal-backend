// services/procurementNotification.js
const nodemailer = require("nodemailer");

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
      console.log("❌PROCUREMENT_MAIL❌==>:", process.env.PROCUREMENT_MAIL);
      console.log(
        "❌PROCUREMENT_MAIL_PASSWORD❌==>:",
        process.env.PROCUREMENT_MAIL_PASSWORD ? "***" : "undefined"
      );

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

  // Purchase Order Notifications

  // Notify vendor about selection for PO
  async sendPurchaseOrderNotification({
    vendor,
    purchaseOrder,
    currentUser,
    type = "selection", // 'selection' or 'approval'
  }) {
    try {
      let subject, htmlTemplate;

      if (type === "selection") {
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
        `✅ PO ${type} notification sent to vendor: ${vendor.businessName}`
      );
    } catch (error) {
      console.error(
        `❌ Failed to send PO ${type} notification to ${vendor.businessName}:`,
        error
      );
      throw error;
    }
  }

  // Notify vendor about PO approval
  async sendPOApprovalNotification({ vendor, purchaseOrder, currentUser }) {
    return this.sendPurchaseOrderNotification({
      vendor,
      purchaseOrder,
      currentUser,
      type: "approval",
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

  // Single vendor notification (no CC/BCC) - RFQ
  async sendRFQNotification({
    vendor,
    rfq,
    currentUser,
    downloadUrl,
    downloadFilename,
  }) {
    try {
      const subject = `Request for Quotation: ${rfq.RFQCode}`;

      const htmlTemplate = this.getRFQTemplate(
        vendor,
        rfq,
        currentUser,
        downloadUrl,
        downloadFilename
      );

      await this.sendMail({
        recipientEmail: vendor.email,
        subject,
        htmlTemplate,
      });
    } catch (error) {
      console.error(
        `❌ Failed to send RFQ notification to ${vendor.businessName}:`,
        error
      );
      throw error;
    }
  }

  // RFQ notification with CC
  async sendRFQNotificationWithCC({
    vendor,
    rfq,
    currentUser,
    downloadUrl,
    downloadFilename,
    cc = [],
  }) {
    try {
      const subject = `Request for Quotation: ${rfq.RFQCode}`;

      const htmlTemplate = this.getRFQTemplate(
        vendor,
        rfq,
        currentUser,
        downloadUrl,
        downloadFilename
      );

      await this.sendMail({
        recipientEmail: vendor.email,
        cc: cc,
        subject,
        htmlTemplate,
      });
    } catch (error) {
      console.error(
        `❌ Failed to send RFQ notification with CC to ${vendor.businessName}:`,
        error
      );
      throw error;
    }
  }

  // RFQ notification with BCC (Primary for vendor communications)
  async sendRFQNotificationWithBCC({
    vendors,
    rfq,
    currentUser,
    downloadUrl,
    downloadFilename,
  }) {
    try {
      if (!vendors || vendors.length === 0) {
        throw new Error("No vendors provided for BCC notification");
      }

      const subject = `Request for Quotation: ${rfq.RFQCode}`;

      // Use first vendor for template personalization
      const primaryVendor = vendors[0];
      const bccEmails = vendors.map((vendor) => vendor.email);

      const htmlTemplate = this.getRFQTemplate(
        primaryVendor,
        rfq,
        currentUser,
        downloadUrl,
        downloadFilename
      );

      // Send to procurement email with all vendors in BCC
      await this.sendMail({
        recipientEmail: process.env.PROCUREMENT_MAIL, // Send to ourselves
        bcc: bccEmails,
        subject,
        htmlTemplate,
      });

      console.log(
        `✅ RFQ ${rfq.RFQCode} sent via BCC to ${vendors.length} vendors`
      );
    } catch (error) {
      console.error(`❌ Failed to send RFQ notification with BCC:`, error);
      throw error;
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

  // Method for sending RFQ with PDF attachment
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
        <p style="font-size: 15px; color: #4b5563; margin: 8px 0 0 0;">
          <strong>Title:</strong> ${purchaseOrder.RFQTitle || "N/A"}
        </p>
      </div>
    
      <div style="margin-bottom: 16px;">
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          <strong style="color: #4b5563;">Congratulations ${
            vendor.contactPerson
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
          <p style="margin: 4px 0;"><strong>Delivery Period:</strong> ${
            purchaseOrder.deliveryPeriod || "N/A"
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
        <p style="font-size: 15px; color: #4b5563; margin: 8px 0 0 0;">
          <strong>Title:</strong> ${purchaseOrder.RFQTitle || "N/A"}
        </p>
      </div>
    
      <div style="margin-bottom: 16px;">
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          <strong style="color: #4b5563;">Dear ${vendor.contactPerson},</strong>
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
          <p style="margin: 4px 0;"><strong>Delivery Period:</strong> ${
            purchaseOrder.deliveryPeriod || "N/A"
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
          <strong style="color: #4b5563;">Dear ${vendor.contactPerson},</strong>
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

  // Existing RFQ template generators (keep these as they are)
  getRFQTemplate(vendor, rfq, currentUser, downloadUrl, downloadFilename) {
    return `
    <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #333333; padding: 40px; max-width: 600px; margin: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px;">
        <h1 style="color: #1373B0; margin: 0 0 8px 0; font-size: 22px; font-weight: 600; line-height: 1.3;">
          Request for Quotation
        </h1>
        <p style="font-size: 15px; color: #4b5563; margin: 0;">
          <strong>RFQ Code:</strong> ${rfq.RFQCode}
        </p>
        <p style="font-size: 15px; color: #4b5563; margin: 8px 0 0 0;">
          <strong>Title:</strong> ${rfq.RFQTitle || "N/A"}
        </p>
      </div>
    
      <div style="margin-bottom: 16px;">
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          <strong style="color: #4b5563;">Hello ${
            vendor.contactPerson
          },</strong>
        </p>
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          You have been invited to submit a bid for the following quotation from CASFOD.
        </p>
      </div>

      <!-- Action Button -->
      <div style="margin-bottom: 24px; padding: 16px; background-color: #f8fafc; border-radius: 6px; border-left: 4px solid #1373B0;">
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #4b5563;">
          <strong>Download RFQ Document:</strong>
        </p>
        <a href="${downloadUrl}" 
        style="display: inline-block; padding: 12px 24px; background-color: #1373B0; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 500; border-radius: 6px; transition: background-color 0.2s;">
          Download RFQ Document
        </a>
        <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280;">
          <strong>File name:</strong> ${downloadFilename}<br>
          <em>If the file doesn't download automatically, right-click the link and select "Save link as..."</em>
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
}

module.exports = new ProcurementNotificationService();
