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
      const mailOptions = {
        from: {
          name: "CASFOD Procurement",
          address: process.env.PROCUREMENT_MAIL,
        },
        to: options.recipientEmail,
        cc: options.cc || undefined,
        subject: options.subject,
        html: options.htmlTemplate,
        attachments: options.attachments || undefined,
      };

      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Procurement email sent to: ${options.recipientEmail}`);
    } catch (error) {
      console.error("Error sending procurement email:", error);
      throw new Error("Failed to send procurement email");
    }
  }

  // RFQ-specific notification method
  async sendRFQNotification({
    vendor,
    rfq,
    currentUser,
    downloadUrl,
    downloadFilename,
  }) {
    try {
      const subject = `Request for Quotation: ${rfq.RFQCode}`;

      const htmlTemplate = `
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
            This is an automated notification from CASFOD Procurement System. Please do not reply to this email.
          </p>
        </div>
      </div>
      `;

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

  // Method for sending RFQ with PDF attachment (if needed later)
  async sendRFQWithAttachment({ vendor, rfq, currentUser, pdfBuffer }) {
    try {
      const subject = `Request for Quotation: ${rfq.RFQCode}`;

      const htmlTemplate = `
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

      await this.sendMail({
        recipientEmail: vendor.email,
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
}

module.exports = new ProcurementNotificationService();
