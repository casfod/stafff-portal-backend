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
      <div style="font-family: Arial, sans-serif; background-color: #fff; color: #333; padding: 20px; text-align: center; border-radius: 8px;">
        <h1 style="color: #1373B0;">${
          requestData.status === "pending" ? "New Request" : "Request Update"
        } Notification</h1>
        <p style="color: #222;">${header}:</p>
        <p style="font-weight: bold;">${title || "N/A"}</p>
        <p>${
          requestData.status === "pending" ? "By" : "Updated By"
        }: ${currentUser.first_name.toUpperCase()} ${currentUser.last_name.toUpperCase()}</p>
        <p>${currentUser.role} MAIL: ${currentUser.email}</p>
        <div style="display: inline-block; padding: 4px 8px; white-space: nowrap; border-radius: 8px; margin-bottom: 4px; text-transform: uppercase; ${
          requestData.status === "draft"
            ? "border: 1px solid #9CA3AF"
            : requestData.status === "pending"
            ? "background-color: #F59E0B; color: white"
            : requestData.status === "approved"
            ? "background-color: #0D9488; color: white"
            : requestData.status === "rejected"
            ? "background-color: #EF4444; color: white"
            : "background-color: #0B6DA2; color: white"
        }">
          ${requestData.status.toUpperCase()}
        </div>
        <p><a href="${requestUrl}" style="display: inline-block; margin-top: 10px; padding: 10px 20px; background-color: #1373B0; color: #FFFFFF; text-decoration: none; font-size: 16px; border-radius: 5px;">View Request</a></p>
        <p style="margin-top: 20px; color: #222;">This is an automated notification. Please do not reply.</p>
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
