import nodemailer from "nodemailer";
import { env } from "../config/env";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  cc?: string | string[];
  bcc?: string | string[];
  text?: string;
}

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  primary: "#1373B0",
  primaryDk: "#0d5a8c",
  success: "#059669",
  warning: "#f59e0b",
  danger: "#dc2626",
  bg: "#f8fafc",
  card: "#ffffff",
  text: "#111827",
  muted: "#4b5563",
  border: "#e5e7eb",
};

// ─── HTML layout wrapper ──────────────────────────────────────────────────────
function layout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${
    T.bg
  };font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${T.text};">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${
    T.bg
  };padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

        <!-- HEADER -->
        <tr>
          <td style="background:${
            T.primary
          };border-radius:8px 8px 0 0;padding:24px 32px;">
            <h1 style="margin:0;font-size:20px;font-weight:600;color:#fff;">CASFOD</h1>
            <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.8);letter-spacing:0.05em;text-transform:uppercase;">
             Casfod Possibity Hub
            </p>
          </td>
        </tr>

        <!-- BODY -->
        <tr>
          <td style="background:${T.card};border:1px solid ${
    T.border
  };border-top:none;padding:32px;">
            ${body}
          </td>
        </tr>

        <!-- FOOTER -->
        <tr>
          <td style="background:#f1f5f9;border:1px solid ${
            T.border
          };border-top:none;border-radius:0 0 8px 8px;padding:16px 32px;text-align:center;">
            <p style="margin:0;font-size:12px;color:${T.muted};">
              This is an automated notification from CASFOD. Please do not reply directly to this email.
            </p>
            <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;">
              © ${new Date().getFullYear()} Casfod Posibility Hub
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Reusable UI blocks ───────────────────────────────────────────────────────
function statusBadge(status: string): string {
  const cfg: Record<string, { bg: string; color: string }> = {
    draft: { bg: "#f3f4f6", color: "#6b7280" },
    pending: { bg: "#fef3c7", color: "#92400e" },
    reviewed: { bg: "#dbeafe", color: "#1e40af" },
    approved: { bg: "#d1fae5", color: "#065f46" },
    rejected: { bg: "#fee2e2", color: "#991b1b" },
    paid: { bg: "#ede9fe", color: "#4c1d95" },
  };
  const s = cfg[status.toLowerCase()] ?? { bg: "#e5e7eb", color: "#374151" };
  return `<span style="display:inline-block;padding:4px 12px;background:${s.bg};color:${s.color};border-radius:9999px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;">${status}</span>`;
}

function primaryButton(label: string, href: string): string {
  return `<a href="${href}" style="display:inline-block;padding:11px 24px;background:${T.primary};color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:500;">${label}</a>`;
}

function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:13px;color:${T.muted};width:160px;vertical-align:top;">${label}</td>
    <td style="padding:6px 0;font-size:13px;color:${T.text};vertical-align:top;">${value}</td>
  </tr>`;
}

function infoTable(rows: string): string {
  return `<table width="100%" cellpadding="0" cellspacing="0"
    style="background:#f8fafc;border:1px solid ${T.border};border-radius:6px;padding:16px;margin:16px 0;">
    <tr><td><table width="100%" cellpadding="0" cellspacing="0">${rows}</table></td></tr>
  </table>`;
}

function alertBox(message: string, color: string): string {
  return `<div style="background:${color}18;border:1px solid ${color}44;border-radius:6px;padding:12px 16px;margin:16px 0;">
    <p style="margin:0;font-size:13px;color:${color};">${message}</p>
  </div>`;
}

// ─── Email service ────────────────────────────────────────────────────────────
class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: env.MAIL_APP_USER,
        pass: env.MAIL_APP_PASSWORD,
      },
      debug: env.NODE_ENV === "development",
    });
  }

  // constructor() {
  //   this.transporter = nodemailer.createTransport({
  //     host: 'smtp.office365.com',
  //     port: 587,
  //     secure: false, 
  //     auth: {
  //       user: env.MAIL_APP_USER,
  //       pass: env.MAIL_APP_PASSWORD,
  //     },
  //     tls: {
  //       ciphers: 'SSLv3'
  //     },
  //     debug: env.NODE_ENV === "development",      
  //   });
  // }
  // ── Core send ─────────────────────────────────────────────────────────────
  private async send(opts: SendMailOptions): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: `"${env.MAIL_FROM_NAME ?? "CASFOD"}" <${env.MAIL_APP_USER}>`,
        to: opts.to,
        cc: opts.cc,
        bcc: opts.bcc,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
      });
      console.log(`📧 Email sent → ${opts.to} | ${opts.subject}`);
    } catch (err) {
      console.error("❌ Email failed:", err);
      throw new Error("Failed to send email");
    }
  }

  // ── 1. Welcome (staff account created by admin) ───────────────────────────
  async sendWelcomeStaffEmail(
    email: string,
    data: {
      name: string;
      tempPassword: string;
      loginUrl: string;
      profileUrl: string;
    }
  ): Promise<void> {
    const html = layout(
      "Staff Account Created",
      `
      <h2 style="margin:0 0 4px;font-size:18px;color:${
        T.text
      };">Welcome to CASFOD</h2>
      <div style="width:32px;height:3px;background:${
        T.primary
      };border-radius:2px;margin-bottom:20px;"></div>

      <p style="margin:0 0 16px;font-size:14px;color:${
        T.muted
      };line-height:1.7;">
        Hi <strong style="color:${T.text};">${data.name}</strong>,<br/>
        Your staff account has been created. Use the temporary credentials below to log in
        and complete your employment profile.
      </p>

      ${infoTable(`
        ${infoRow(
          "Login URL",
          `<a href="${data.loginUrl}" style="color:${T.primary};text-decoration:none;">${data.loginUrl}</a>`
        )}
        ${infoRow("Email", email)}
        ${infoRow(
          "Temp Password",
          `<code style="background:#f1f5f9;padding:2px 8px;border-radius:4px;font-size:12px;">${data.tempPassword}</code>`
        )}
      `)}

      ${alertBox(
        "⚠️ &nbsp;Please change your password immediately after logging in. Temporary passwords expire in 24 hours.",
        T.danger
      )}

      <p style="margin:0 0 24px;font-size:14px;color:${T.muted};">
        After logging in, visit your
        <a href="${data.profileUrl}" style="color:${
        T.primary
      };">Employment Profile</a>
        to complete your personal and job details.
      </p>
      <div style="text-align:center;">${primaryButton(
        "Log In Now →",
        data.loginUrl
      )}</div>
    `
    );
    await this.send({ to: email, subject: "Your CASFOD Staff Account", html });
  }

  // ── 2. Password reset ─────────────────────────────────────────────────────
  async sendPasswordResetEmail(
    email: string,
    resetToken: string
  ): Promise<void> {
    const resetURL = `${env.FRONTEND_URL}/reset-password/${resetToken}`;
    const html = layout(
      "Password Reset Request",
      `
      <h2 style="margin:0 0 4px;font-size:18px;color:${
        T.text
      };">Password Reset</h2>
      <div style="width:32px;height:3px;background:${
        T.primary
      };border-radius:2px;margin-bottom:20px;"></div>

      <p style="margin:0 0 20px;font-size:14px;color:${
        T.muted
      };line-height:1.7;">
        We received a request to reset the password for
        <strong style="color:${T.text};">${email}</strong>.
        Click below to set a new password — this link expires in
        <strong style="color:${T.primary};">10 minutes</strong>.
      </p>

      <div style="text-align:center;margin:24px 0;">${primaryButton(
        "Reset Password →",
        resetURL
      )}</div>

      <div style="background:#f8fafc;border:1px solid ${
        T.border
      };border-radius:6px;padding:12px 16px;margin:16px 0;">
        <p style="margin:0 0 4px;font-size:12px;color:${
          T.muted
        };">Or copy this link:</p>
        <p style="margin:0;font-size:12px;color:${
          T.primary
        };word-break:break-all;">${resetURL}</p>
      </div>

      <p style="margin:16px 0 0;font-size:13px;color:${T.muted};">
        If you didn't request this, you can safely ignore this email.
      </p>
    `
    );
    await this.send({
      to: email,
      subject: "Password Reset — CASFOD (expires in 10 min)",
      html,
      text: `Reset your password: ${resetURL}`,
    });
  }

  // ── 3. Account deactivated ────────────────────────────────────────────────
  async sendAccountDeactivated(email: string, name: string): Promise<void> {
    const supportEmail = process.env.SUPPORT_EMAIL ?? env.MAIL_APP_USER;
    const html = layout(
      "Account Deactivated",
      `
      <h2 style="margin:0 0 4px;font-size:18px;color:${
        T.text
      };">Account Deactivated</h2>
      <div style="width:32px;height:3px;background:${
        T.danger
      };border-radius:2px;margin-bottom:20px;"></div>

      <p style="margin:0 0 16px;font-size:14px;color:${
        T.muted
      };line-height:1.7;">
        Hi <strong>${name}</strong>, your CASFOD account has been deactivated.
        If you believe this is an error, please contact HR or support.
      </p>
      <div style="text-align:center;">${primaryButton(
        "Contact Support →",
        `mailto:${supportEmail}`
      )}</div>
    `
    );
    await this.send({
      to: email,
      subject: "Account Deactivated — CASFOD",
      html,
    });
  }

  // ── 4. Workflow notification (generic request update) ─────────────────────
  async sendRequestNotification(opts: {
    recipientEmail: string;
    recipientName?: string;
    subject: string;
    header: string;
    requestTitle: string;
    requestStatus: string;
    actorName: string;
    actorRole: string;
    actorEmail: string;
    requestUrl: string;
    isPending?: boolean;
  }): Promise<void> {
    const html = layout(
      opts.subject,
      `
      <h2 style="margin:0 0 4px;font-size:18px;color:${T.text};">
        ${
          opts.isPending
            ? `New ${opts.requestTitle}`
            : `${opts.requestTitle} Update`
        }
      </h2>
      <div style="width:32px;height:3px;background:${
        T.primary
      };border-radius:2px;margin-bottom:20px;"></div>

      <p style="margin:0 0 16px;font-size:14px;color:${T.muted};">
        <strong>${opts.header}</strong>
      </p>

      ${infoTable(`
        ${infoRow(
          opts.isPending ? "By" : "Updated By",
          `<strong>${opts.actorName.toUpperCase()}</strong>`
        )}
        ${infoRow("Role", opts.actorRole)}
        ${infoRow(
          "Email",
          `<a href="mailto:${opts.actorEmail}" style="color:${T.primary};text-decoration:none;">${opts.actorEmail}</a>`
        )}
        ${infoRow("Status", statusBadge(opts.requestStatus))}
      `)}

      <div style="margin-top:24px;text-align:center;">
        ${primaryButton("View Request →", opts.requestUrl)}
      </div>
    `
    );
    await this.send({ to: opts.recipientEmail, subject: opts.subject, html });
  }

  // ── 5. Copy / share notification ──────────────────────────────────────────
  async sendCopyNotification(opts: {
    senderEmail: string;
    ccEmails: string[];
    subject: string;
    senderName: string;
    senderRole: string;
    requestTitle: string;
    requestUrl: string;
  }): Promise<void> {
    const html = layout(
      opts.subject,
      `
      <h2 style="margin:0 0 4px;font-size:18px;color:${T.text};">${
        opts.requestTitle
      } — Copy</h2>
      <div style="width:32px;height:3px;background:${
        T.primary
      };border-radius:2px;margin-bottom:20px;"></div>

      <p style="margin:0 0 16px;font-size:14px;color:${T.muted};">
        You have been given access to a document.
      </p>

      ${infoTable(`
        ${infoRow(
          "Shared By",
          `<strong>${opts.senderName.toUpperCase()}</strong>`
        )}
        ${infoRow("Role", opts.senderRole)}
        ${infoRow("Document", opts.requestTitle)}
      `)}

      <div style="margin-top:24px;text-align:center;">
        ${primaryButton("View Document →", opts.requestUrl)}
      </div>
    `
    );
    await this.send({
      to: opts.senderEmail,
      cc: opts.ccEmails,
      subject: opts.subject,
      html,
    });
  }

// ─── 6. RFQ notification to vendors (BCC) - Enhanced with multiple files ──
async sendRFQNotification(opts: {
  bccEmails: string[];
  rfqCode: string;
  rfqTitle: string;
  deadlineDate?: string;
  fileDownloads: Array<{
    name: string;
    url: string;
    fileType?: string;
    size?: number;
  }>;
  fileCount?: number;
}): Promise<void> {
  const filesHtml = opts.fileDownloads.length
    ? opts.fileDownloads
        .map(
          (f) => `
          <tr>
            <td style="padding:10px;font-size:13px;color:${T.text};">
              <span style="display:flex;align-items:center;gap:8px;">
                ${f.fileType?.includes('pdf') ? '📄' : f.fileType?.includes('image') ? '🖼️' : '📎'}
                ${f.name}
                ${f.size ? `<span style="color:${T.muted};font-size:11px;">(${(f.size / 1024).toFixed(1)} KB)</span>` : ''}
              </span>
            </td>
            <td style="padding:10px;text-align:right;">
              <a href="${f.url}" style="display:inline-block;padding:6px 14px;background:${T.primary};color:#fff;border-radius:4px;font-size:12px;text-decoration:none;font-weight:500;">Download</a>
            </td>
          </tr>`
        )
        .join("")
      : `<tr><td style="padding:10px;font-size:13px;color:${T.muted};text-align:center;">No documents attached.</td></tr>`;

  const html = layout(
    `RFQ: ${opts.rfqCode}`,
    `
    <h2 style="margin:0 0 4px;font-size:20px;color:${T.text};">CASFOD — Request for Quotation</h2>
    <div style="width:40px;height:3px;background:${T.primary};border-radius:2px;margin-bottom:20px;"></div>

    <p style="margin:0 0 16px;font-size:14px;color:${T.muted};line-height:1.7;">
      Hello,<br/>
      You have been invited to submit a bid for the following Request for Quotation.
    </p>

    ${infoTable(`
      ${infoRow("RFQ Code", `<strong style="color:${T.primary};">${opts.rfqCode}</strong>`)}
      ${infoRow("Title", opts.rfqTitle)}
      ${opts.deadlineDate ? infoRow("Deadline", opts.deadlineDate) : ""}
      ${infoRow("Documents", `${opts.fileDownloads.length} file(s) attached`)}
    `)}

    <p style="margin:16px 0 8px;font-size:14px;font-weight:600;color:${T.text};">📎 Attached Documents (${opts.fileDownloads.length})</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${T.border};border-radius:6px;overflow:hidden;margin-bottom:16px;">
      <thead>
        <tr style="background:#f8fafc;">
          <th style="padding:8px 10px;font-size:12px;text-align:left;color:${T.muted};font-weight:600;border-bottom:1px solid ${T.border};">File Name</th>
          <th style="padding:8px 10px;font-size:12px;text-align:right;color:${T.muted};font-weight:600;border-bottom:1px solid ${T.border};">Action</th>
        </tr>
      </thead>
      <tbody>
        ${filesHtml}
      </tbody>
    </table>

    <p style="margin:8px 0 0;font-size:12px;color:${T.muted};">
      <em>💡 If files don't download automatically, right-click the download button and select "Save link as..."</em>
    </p>
  `
  );

  await this.send({
    to: process.env.PROCUREMENT_MAIL ?? env.MAIL_APP_USER,
    bcc: opts.bccEmails,
    subject: `📄 Request for Quotation: ${opts.rfqCode} - ${opts.rfqTitle}`,
    html,
  });
}

// ─── 7. PO notification to vendor - Enhanced with multiple files ──────────
async sendPurchaseOrderNotification(opts: {
  vendorEmail: string;
  vendorContact: string;
  poCode: string;
  rfqTitle: string;
  totalAmount: number;
  deliveryDate?: string;
  status: "approved" | "rejected" | "selected";
  fileDownloads?: Array<{ name: string; url: string; fileType?: string; size?: number }>;
}): Promise<void> {
  const isApproved = opts.status === "approved";
  const isRejected = opts.status === "rejected";
  const accentColor = isApproved
    ? T.success
    : isRejected
    ? T.danger
    : T.primary;

  const filesHtml = (opts.fileDownloads ?? [])
    .map(
      (f) => `
    <tr>
      <td style="padding:10px;font-size:13px;color:${T.text};">
        <span style="display:flex;align-items:center;gap:8px;">
          ${f.fileType?.includes('pdf') ? '📄' : '📎'}
          ${f.name}
          ${f.size ? `<span style="color:${T.muted};font-size:11px;">(${(f.size / 1024).toFixed(1)} KB)</span>` : ''}
        </span>
      </td>
      <td style="padding:10px;text-align:right;">
        <a href="${f.url}" style="display:inline-block;padding:6px 14px;background:${T.success};color:#fff;border-radius:4px;font-size:12px;text-decoration:none;font-weight:500;">Download</a>
      </td>
    </tr>`
    )
    .join("");

  const headline =
    opts.status === "approved"
      ? "✅ Purchase Order Approved"
      : opts.status === "rejected"
      ? "❌ Purchase Order Update"
      : "📋 Purchase Order Selection";

  const message =
    opts.status === "approved"
      ? `The following Purchase Order has been officially approved. Please review the attached documents and sign where required.`
      : opts.status === "rejected"
      ? "We regret to inform you that the following Purchase Order has been rejected. Our team may contact you for future opportunities."
      : "Your bid has been selected. Our procurement team will contact you to proceed.";

  const html = layout(
    headline,
    `
    <h2 style="margin:0 0 4px;font-size:20px;color:${accentColor};">${headline}</h2>
    <div style="width:40px;height:3px;background:${accentColor};border-radius:2px;margin-bottom:20px;"></div>

    <p style="margin:0 0 16px;font-size:14px;color:${T.muted};line-height:1.7;">
      Dear <strong>${opts.vendorContact}</strong>,<br/>${message}
    </p>

    ${infoTable(`
      ${infoRow("PO Code", `<strong style="color:${T.primary};">${opts.poCode}</strong>`)}
      ${infoRow("Title", opts.rfqTitle)}
      ${opts.deliveryDate ? infoRow("Delivery Date", opts.deliveryDate) : ""}
      ${infoRow("Total Amount", `<strong style="color:${T.primary};">₦${opts.totalAmount.toLocaleString()}</strong>`)}
      ${infoRow("Status", statusBadge(opts.status))}
      ${(opts.fileDownloads?.length ?? 0) > 0 ? infoRow("Attachments", `${opts.fileDownloads?.length} file(s)`) : ""}
    `)}

    ${filesHtml ? `
      <p style="margin:16px 0 8px;font-size:14px;font-weight:600;color:${T.text};">📎 Attached Documents (${opts.fileDownloads?.length ?? 0})</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${T.border};border-radius:6px;overflow:hidden;margin-bottom:16px;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 10px;font-size:12px;text-align:left;color:${T.muted};font-weight:600;border-bottom:1px solid ${T.border};">File Name</th>
            <th style="padding:8px 10px;font-size:12px;text-align:right;color:${T.muted};font-weight:600;border-bottom:1px solid ${T.border};">Action</th>
          </tr>
        </thead>
        <tbody>
          ${filesHtml}
        </tbody>
      </table>
    ` : ""}

    ${isApproved ? `
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:12px 16px;margin:16px 0;">
        <p style="margin:0;font-size:13px;color:#166534;">
          ⚠️ Please sign and return the PO document to procurement@casfod.org before proceeding with delivery.
        </p>
      </div>
    ` : ""}
  `
  );

  await this.send({
    to: opts.vendorEmail,
    subject: `${headline}: ${opts.poCode} - ${opts.rfqTitle}`,
    html,
  });
}

// ─── 9. Generic transactional email with file attachments ──────────────────
async sendCustomEmailWithFiles(
  to: string,
  subject: string,
  bodyHtml: string,
  fileDownloads?: Array<{ name: string; url: string; fileType?: string; size?: number }>,
  options?: { cc?: string[]; bcc?: string[] }
): Promise<void> {
  let html = bodyHtml;

  if (fileDownloads?.length) {
    const filesHtml = fileDownloads
      .map(
        (f) => `
      <tr>
        <td style="padding:10px;font-size:13px;color:${T.text};">${f.name}</td>
        <td style="padding:10px;text-align:right;">
          <a href="${f.url}" style="display:inline-block;padding:6px 14px;background:${T.primary};color:#fff;border-radius:4px;font-size:12px;text-decoration:none;">Download</a>
        </td>
      </tr>`
      )
      .join("");

    html += `
      <p style="margin:16px 0 8px;font-size:14px;font-weight:600;color:${T.text};">📎 Attached Documents (${fileDownloads.length})</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${T.border};border-radius:6px;overflow:hidden;">
        <thead>
          <tr style="background:#f8fafc;">
            <th style="padding:8px 10px;font-size:12px;text-align:left;color:${T.muted};font-weight:600;">File Name</th>
            <th style="padding:8px 10px;font-size:12px;text-align:right;color:${T.muted};font-weight:600;">Action</th>
          </tr>
        </thead>
        <tbody>${filesHtml}</tbody>
      </table>
    `;
  }

  await this.send({
    to,
    subject,
    html: layout(subject, html),
    ...options,
  });
}

  

  // ── 9. Generic transactional email ────────────────────────────────────────
  async sendCustomEmail(
    to: string,
    subject: string,
    bodyHtml: string,
    options?: { cc?: string[]; bcc?: string[] }
  ): Promise<void> {
    await this.send({
      to,
      subject,
      html: layout(subject, bodyHtml),
      ...options,
    });
  }
}

export const emailService = new EmailService();


