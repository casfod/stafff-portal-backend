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

// Get all RFQs - REMOVED ROLE-BASED ACCESS CONTROL
const getRFQs = async (queryParams) => {
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

  const rfqsWithFiles = await Promise.all(
    rfqs.map(async (rfq) => {
      const files = await fileService.getFilesByDocument("RFQs", rfq._id);
      return {
        ...rfq.toJSON(),
        files: normalizeFiles(files),
      };
    })
  );

  return {
    rfqs: rfqsWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// Update RFQ status
const updateRFQStatus = async (id, status) => {
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

// Create RFQ (draft)
const saveRFQ = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.status = "draft"; // Force draft status

  const rfq = new RFQ(data);
  return await rfq.save();
};

// Save to send RFQ (preview with RFQ code generation)
const savetoSendRFQ = async (data, currentUser, files = []) => {
  data.createdBy = currentUser._id;
  data.status = "preview"; // Force preview status to trigger RFQ code generation

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
const updateRFQ = async (id, data, files = []) => {
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
    await fileService.deleteFilesByDocument("RFQs", id);
    await handleFileUploads({
      files,
      requestId: updatedRFQ._id,
      modelTable: "RFQs",
    });
  }

  return updatedRFQ;
};

// Enhanced copy RFQ to vendors - this is where status changes to "sent"
const copyRFQToVendors = async ({
  currentUser,
  requestId,
  recipients,
  files = [],
}) => {
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

  // Handle single PDF file upload for sent RFQs
  let pdfUrl = null;
  let existingPDF = null;
  if (files.length > 0) {
    // Validate it's a PDF file
    const pdfFile = files[0];
    if (pdfFile.mimetype !== "application/pdf") {
      throw new Error("Only PDF files are allowed for RFQ distribution");
    }

    const uploadedFile = await fileService.uploadFile(pdfFile);

    await fileService.associateFile(
      uploadedFile._id,
      "RFQs",
      requestId,
      "rfq_pdf"
    );

    pdfUrl = uploadedFile.url;
    existingPDF = uploadedFile;
  } else {
    const existingFiles = await fileService.getFilesByDocument(
      "RFQs",
      requestId
    );
    existingPDF = existingFiles.find(
      (file) => file.mimeType === "application/pdf"
    );

    if (!existingPDF) {
      throw new Error(
        "No PDF file found for this RFQ. Please upload a PDF file."
      );
    }

    pdfUrl = existingPDF.url;
  }

  // Use MongoDB's $addToSet to prevent duplicates at database level
  const updatedRFQ = await RFQ.findByIdAndUpdate(
    requestId,
    {
      $addToSet: { copiedTo: { $each: recipients } },
      status: "sent",
      updatedAt: new Date(),
    },
    {
      new: true,
      runValidators: true,
    }
  );

  // Send notifications to vendors with the PDF URL
  await notifyVendors(updatedRFQ, currentUser, pdfUrl, existingPDF);

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

// Update notifyVendors to accept pdfUrl parameter
const notifyVendors = async (rfq, currentUser, pdfUrl, existingPDF) => {
  try {
    if (!pdfUrl) {
      throw new Error("PDF URL is required for vendor notifications");
    }

    // Send notification to each vendor
    const vendors = await Vendor.find({ _id: { $in: rfq.copiedTo } });

    for (const vendor of vendors) {
      await sendRFQNotification({
        vendor,
        rfq,
        currentUser,
        pdfUrl: pdfUrl,
        existingPDF, // Use the provided PDF URL
      });
    }

    console.log(`Notifications sent for RFQ: ${rfq.RFQCode}`);
  } catch (error) {
    console.error("Error notifying vendors:", error);
    throw error;
  }
};

// Enhanced sendRFQNotification with proper file naming
const sendRFQNotification = async ({
  vendor,
  rfq,
  currentUser,
  pdfUrl,
  existingPDF,
}) => {
  try {
    const subject = `Request for Quotation: ${rfq.RFQCode}`;

    const downloadFilename = `${rfq.RFQCode}.pdf`;
    const downloadUrl = `${process.env.API_BASE_URL}/files/${existingPDF._id}/download`;

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
          You have been invited to submit a bid for the following quotation:
        </p>
      </div>

      <!-- Action Button with better instructions -->
      <div style="margin-bottom: 24px; padding: 16px; background-color: #f8fafc; border-radius: 6px; border-left: 4px solid #1373B0;">
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #4b5563;">
          <strong>Download Instructions:</strong>
        </p>
        <a href="${downloadUrl}" 
        style="display: inline-block; padding: 12px 24px; background-color: #1373B0; color: #ffffff; text-decoration: none; font-size: 15px; font-weight: 500; border-radius: 6px;">
        Download RFQ Document
        </a>
        <p style="margin: 8px 0 0 0; font-size: 13px; color: #6b7280;">
          <strong>File name:</strong> ${downloadFilename}<br>
          <em>If the file doesn't download as PDF, right-click the link and select "Save link as..."</em>
        </p>
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
// Get RFQ by ID
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
