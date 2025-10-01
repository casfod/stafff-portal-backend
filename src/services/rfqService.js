const RFQ = require("../models/RFQModel");
const Vendor = require("../models/VendorModel");
const fileService = require("./fileService");
const BaseCopyService = require("./BaseCopyService");
const handleFileUploads = require("../utils/FileUploads");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const NotificationService = require("./notificationService");
class RFQCopyService extends BaseCopyService {
  constructor() {
    super(RFQ, "RFQ");
  }
}

const rfqCopyService = new RFQCopyService();

// Get all RFQs
const getRFQs = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;

  const searchFields = [
    "RFQTitle",
    "RFQCode",
    "deliveryPeriod",
    "bidValidityPeriod",
    "status",
  ];

  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  // Role-based access control
  switch (currentUser.role) {
    case "STAFF":
      query.createdBy = currentUser._id;
      break;
    case "ADMIN":
    case "REVIEWER":
      query.$or = [
        { createdBy: currentUser._id },
        { status: { $ne: "draft" } },
      ];
      break;
    case "SUPER-ADMIN":
      // Can see all RFQs
      break;
    default:
      throw new Error("Invalid user role");
  }

  const sortQuery = buildSortQuery(sort);
  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "copiedTo", select: "businessName email contactPerson" },
  ];

  const {
    results: rfqs,
    total,
    totalPages,
    currentPage,
  } = await paginate(RFQ, query, { page, limit }, sortQuery, populateOptions);

  return {
    rfqs,
    total,
    totalPages,
    currentPage,
  };
};

// Update RFQ status
const updateRFQStatus = async (id, status, currentUser) => {
  const validStatuses = ["draft", "sent", "cancelled"];

  if (!validStatuses.includes(status)) {
    throw new Error("Invalid status");
  }

  const rfq = await RFQ.findByIdAndUpdate(
    id,
    { status, updatedAt: new Date() },
    { new: true }
  );

  if (!rfq) {
    throw new Error("RFQ not found");
  }

  return rfq;
};

// Delete RFQ
const deleteRFQ = async (id) => {
  await fileService.deleteFilesByDocument("RFQs", id);
  return await RFQ.findByIdAndDelete(id);
};

//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////

// Create RFQ (preview or draft)
const saveRFQ = async (data, currentUser) => {
  data.createdBy = currentUser._id;

  // Ensure status is either preview or draft
  if (!["preview", "draft"].includes(data.status)) {
    data.status = "preview";
  }

  const rfq = new RFQ(data);
  return await rfq.save();
};

// Save and send RFQ (creates preview only)
const savetoSendRFQ = async (data, currentUser, files = []) => {
  data.createdBy = currentUser._id;
  data.status = "preview"; // Force preview status

  const rfq = new RFQ(data);
  await rfq.save();

  // Handle file uploads (attachments)
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: rfq._id,
      modelTable: "RFQs",
    });
  }

  return rfq;
};

// Update RFQ - only allowed for preview/draft status
const updateRFQ = async (id, data, files = [], currentUser) => {
  const existingRFQ = await RFQ.findById(id);

  if (!existingRFQ) {
    throw new Error("RFQ not found");
  }

  // Prevent updating sent RFQs
  if (existingRFQ.status === "sent") {
    throw new Error("Cannot update a sent RFQ");
  }

  const updatedRFQ = await RFQ.findByIdAndUpdate(
    id,
    {
      ...data,
      status: data.status || existingRFQ.status, // Maintain existing status if not provided
      updatedAt: new Date(),
    },
    { new: true, runValidators: true }
  );

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: updatedRFQ._id,
      modelTable: "RFQs",
    });
  }

  return updatedRFQ;
};

// Enhanced copy RFQ to vendors - this is where status changes to "sent"
const copyRFQToVendors = async ({ currentUser, requestId, recipients }) => {
  // Validate input
  if (!requestId || !recipients || !Array.isArray(recipients)) {
    throw new Error("Invalid input parameters");
  }

  const originalRFQ = await RFQ.findById(requestId);
  if (!originalRFQ) {
    throw new Error("RFQ not found");
  }

  // Verify user can share this RFQ
  await verifyCanShareRFQ(originalRFQ, currentUser);

  // Update RFQ status to "sent" and generate proper RFQ code
  originalRFQ.status = "sent";
  originalRFQ.copiedTo = [...new Set([...originalRFQ.copiedTo, ...recipients])];

  await originalRFQ.save();

  // // Generate and attach PDF with proper RFQ code
  // await generateAndAttachRFQPDF(originalRFQ);

  // Send notifications to vendors
  await notifyVendors(originalRFQ, currentUser);

  // Populate and return the updated RFQ
  const populatedRFQ = await RFQ.findById(requestId)
    .populate("createdBy", "email first_name last_name role")
    .populate("copiedTo", "businessName email contactPerson");

  return populatedRFQ;
};

// Verify user can share RFQ
const verifyCanShareRFQ = async (rfq, currentUser) => {
  const isCreator = rfq.createdBy.toString() === currentUser._id.toString();
  const canShare =
    isCreator || ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);

  if (!canShare) {
    throw new Error("Unauthorized: You cannot share this RFQ");
  }

  // Optional: Add additional business rules
  if (rfq.status === "cancelled") {
    throw new Error("Cannot share a cancelled RFQ");
  }
};

// Generate and attach RFQ PDF (only for sent RFQs)
const generateAndAttachRFQPDF = async (rfq) => {
  try {
    // Get populated RFQ data for PDF
    const populatedRFQ = await RFQ.findById(rfq._id)
      .populate("createdBy", "email first_name last_name role")
      .lean();

    // Generate PDF buffer
    const pdfBuffer = await generateRFQPDFBuffer(populatedRFQ);

    // Create file object with proper RFQ code as filename
    const pdfFile = {
      buffer: pdfBuffer,
      originalname: `${rfq.RFQCode}.pdf`,
      mimetype: "application/pdf",
      size: pdfBuffer.length,
    };

    // Upload to file service
    const uploadedPDF = await fileService.uploadFile(pdfFile);

    // Associate with RFQ using specific field name
    await fileService.associateFile(
      uploadedPDF._id,
      "RFQs",
      rfq._id,
      "rfq_pdf"
    );

    console.log(`PDF generated for RFQ: ${rfq.RFQCode}`);
    return uploadedPDF;
  } catch (error) {
    console.error("Error generating RFQ PDF:", error);
    throw error;
  }
};

// Notify vendors - only sends the RFQ PDF
const notifyVendors = async (rfq, currentUser) => {
  try {
    // Get only the RFQ PDF (not other attachments)
    const allFiles = await fileService.getFilesByDocument("RFQs", rfq._id);
    const rfqPDF = allFiles.find(
      (file) =>
        file.mimeType === "application/pdf" &&
        file.name === `${rfq.RFQCode}.pdf`
    );

    if (!rfqPDF) {
      throw new Error("RFQ PDF not found");
    }

    // Send notification to each vendor
    const vendors = await Vendor.find({ _id: { $in: rfq.copiedTo } });

    for (const vendor of vendors) {
      await sendRFQNotification({
        vendor,
        rfq,
        currentUser,
        pdfUrl: rfqPDF.url,
      });
    }

    console.log(`Notifications sent for RFQ: ${rfq.RFQCode}`);
  } catch (error) {
    console.error("Error notifying vendors:", error);
    throw error;
  }
};

// Enhanced sendRFQNotification with proper file naming
const sendRFQNotification = async ({ vendor, rfq, currentUser, pdfUrl }) => {
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
          <strong style="color: #4b5563;">Dear ${vendor.contactPerson},</strong>
        </p>
        <p style="font-size: 15px; margin: 0 0 12px 0; line-height: 1.5;">
          You have been invited to submit a quotation for the following request:
        </p>
      </div>

      <!-- Action Button -->
      <div style="margin-bottom: 32px;">
        <a href="${pdfUrl}" download="${rfq.RFQCode}.pdf" style="display: inline-block; padding: 12px 24px; background-color: #1373B0; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 500; border-radius: 6px; transition: background-color 0.2s;">
          Download RFQ Document (${rfq.RFQCode}.pdf)
        </a>
      </div>

      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px;">
        <p style="margin: 0; font-size: 13px; color: #6b7280; line-height: 1.5;">
          This is an automated notification from CASFOD Procurement System.
        </p>
      </div>
    </div>
    `;

    await NotificationService.sendMail({
      recipientEmail: vendor.email,
      subject,
      htmlTemplate,
    });

    console.log(
      `✅ RFQ ${rfq.RFQCode} notification sent to: ${vendor.businessName}`
    );
  } catch (error) {
    console.error(
      `❌ Failed to send RFQ notification to ${vendor.businessName}:`,
      error
    );
    throw error;
  }
};

// Get RFQ by ID - ensure it works with all statuses
const getRFQById = async (id) => {
  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role" },
    {
      path: "copiedTo",
      select: "businessName email contactPerson businessPhoneNumber",
    },
  ];

  const rfq = await RFQ.findById(id).populate(populateOptions).lean();

  if (!rfq) {
    throw new Error("RFQ not found");
  }

  // Fetch associated files
  const files = await fileService.getFilesByDocument("RFQs", id);

  return normalizeId({
    ...rfq,
    files: normalizeFiles(files),
  });
};

module.exports = {
  rfqCopyService,
  getRFQs,
  saveRFQ,
  savetoSendRFQ,
  getRFQById,
  updateRFQ,
  updateRFQStatus,
  deleteRFQ,
  copyRFQToVendors,
};
