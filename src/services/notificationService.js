// services/notificationService.js
const nodemailer = require("nodemailer");
const User = require("../models/UserModel"); // Assuming you have a User model

class NotificationService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.USER_MAIL,
        pass: process.env.MAIL_APP_PASSWORD,
      },
      debug: true,
    });
  }

  async sendMail(options) {
    try {
      const mailOptions = {
        from: {
          name: "Casfod Possibility Hub",
          address: process.env.USER_MAIL,
        },
        to: options.recipientEmail,
        subject: options.subject,
        html: options.htmlTemplate,
      };

      await this.transporter.sendMail(mailOptions);
    } catch (error) {
      console.error("Error sending email:", error);
      throw new Error("Failed to send email");
    }
  }

  async sendRequestNotification({
    requestData,
    currentUser,
    recipientIds,
    requestType,
    title,
    header,
  }) {
    try {
      const recipients = await User.find({
        _id: { $in: recipientIds },
      }).select("email first_name last_name");

      if (!recipients.length) return;

      const subject =
        requestData.status === "pending"
          ? `New Request: ${title || "N/A"}`
          : `Request Update: ${title || "N/A"}`;

      // Map request types to their URL paths
      const requestTypePaths = {
        conceptNote: "concept-notes/request",
        purchaseRequest: "purchase-requests/request",
        paymentRequest: "payment-requests/request",
        advanceRequest: "advance-requests/request",
        travelRequest: "travel-requests/request",
        expenseClaim: "expense-claims/request",
      };

      const requestUrl = `${process.env.BASE_URL}/${requestTypePaths[requestType]}/${requestData._id}`;

      const htmlTemplate = `
      <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #ffffff; color: #333333; padding: 40px; max-width: 600px; margin: auto; border-radius: 8px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08); border: 1px solid #e5e7eb;">
      <div style="border-bottom: 1px solid #e5e7eb; padding-bottom: 20px; margin-bottom: 24px;">
        <h1 style="color: #1373B0; margin: 0 0 8px 0; font-size: 22px; font-weight: 600; line-height: 1.3;">
          ${
            requestData.status === "pending"
              ? `New ${title || "N/A"}`
              : `${title || "N/A"} Update`
          }
        </h1>
        
        <p style="font-size: 15px; color: #4b5563; margin: 0;"><strong>${header}:</strong></p>
      </div>
    
      <div style="margin-bottom: 24px;">
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
        <strong style="color: #4b5563;">${
          requestData.status === "pending" ? "BY" : "UPDATED BY"
        }:</strong> 
          <strong style="color: #111827;">${currentUser.first_name.toUpperCase()} ${currentUser.last_name.toUpperCase()}</strong>
        </p>
        
        <p style="font-size: 15px; margin: 0 0 8px 0; line-height: 1.5;">
          <strong style="color: #4b5563;">ROLE:</strong> 
          <span style="color: #111827;">${currentUser.role}</span>
        </p>
        
        <p style="font-size: 15px; margin: 0; line-height: 1.5;">
          <strong style="color: #4b5563;">MAIL:</strong> 
          <a href="mailto:${
            currentUser.email
          }" style="color: #1373B0; text-decoration: none;">${
        currentUser.email
      }</a>
        </p>
      </div>
    
      <div style="margin-bottom: 28px;">
        <span style="display: inline-block; padding: 6px 14px; border-radius: 16px; font-size: 13px; font-weight: 600; letter-spacing: 0.3px; text-transform: uppercase;
          ${
            requestData.status === "draft"
              ? "border: 1px solid #9CA3AF; color: #6B7280; background-color: #f3f4f6;"
              : requestData.status === "pending"
              ? "background-color: #f59e0b; color: #ffffff;"
              : requestData.status === "approved"
              ? "background-color: #059669; color: #ffffff;"
              : requestData.status === "rejected"
              ? "background-color: #dc2626; color: #ffffff;"
              : "background-color: #1373B0; color: #ffffff;"
          }">
          ${requestData.status.toUpperCase()}
        </span>
      </div>
    
      <div style="margin-bottom: 32px;">
        <a href="${requestUrl}" style="display: inline-block; padding: 12px 24px; background-color: #1373B0; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 500; border-radius: 6px; transition: background-color 0.2s;">
          View Request
        </a>
      </div>
    
      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
          This is an automated notification. Please do not reply.
        </p>
      </div>
    </div>
    `;

      await Promise.all(
        recipients.map((recipient) =>
          this.sendMail({
            recipientEmail: recipient.email,
            subject,
            htmlTemplate,
          })
        )
      );
    } catch (error) {
      console.error("Error sending request notification:", error);
      throw error;
    }
  }

  // Update the sendCopyNotification method in notificationService.js
  async sendCopyNotification({
    documentId,
    documentType,
    originalRequester,
    recipients,
    documentTitle,
  }) {
    try {
      const [recipientUsers, requester] = await Promise.all([
        User.find({ _id: { $in: recipients } }).select("email first_name"),
        User.findById(originalRequester).select("first_name last_name"),
      ]);

      const subject = `${documentType} Shared With You: ${documentTitle}`;

      const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; background-color: #fff; color: #333; padding: 20px; text-align: center; border-radius: 8px;">
        <h1 style="color: #1373B0;">${documentType} Shared With You</h1>
        <p style="color: #222;">${requester.first_name} ${
        requester.last_name
      } has shared a ${documentType.toLowerCase()} with you:</p>
        <p style="font-weight: bold;">${documentTitle}</p>
        <a href="${
          process.env.BASE_URL
        }/${documentType.toLowerCase()}s/${documentId}" 
           style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #1373B0; color: #FFFFFF; text-decoration: none; font-size: 16px; border-radius: 5px;">
          View ${documentType}
        </a>
      </div>
    `;

      await Promise.all(
        recipientUsers.map((recipient) =>
          this.sendMail({
            recipientEmail: recipient.email,
            subject,
            htmlTemplate,
          })
        )
      );
    } catch (error) {
      console.error("Error sending copy notification:", error);
      throw error;
    }
  }
  // Keep your existing password reset method
  async sendPasswordReset(options) {
    const htmlTemplate = `
      <div style="font-family: Arial, sans-serif; background-color: #fff; color: #333; padding: 20px; text-align: center; border-radius: 8px;">
        <h1 style="color: #1373B0;">Password Reset Request</h1>
        <p style="color: #222;">You requested a password reset for your account. Please click the button below to reset your password. This link will expire in 10 minutes.</p>
        <a href="${options.resetURL}" style="display: inline-block; margin-top: 20px; padding: 10px 20px; background-color: #1373B0; color: #FFFFFF; text-decoration: none; font-size: 16px; border-radius: 5px;">Reset Password</a>
        <p style="margin-top: 20px; color: #222;">If you did not request this password reset, please ignore this email.</p>
      </div>
    `;

    await this.sendMail({
      recipientEmail: options.userMail,
      subject: "Reset Your Password",
      htmlTemplate,
    });
  }
}

module.exports = new NotificationService();

/**
 * <p style="font-weight: bold;">${title || "N/A"}</p>
 */
