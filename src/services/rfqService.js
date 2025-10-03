const RFQ = require("../models/RFQModel");
const Vendor = require("../models/VendorModel");
const fileService = require("./fileService");
const BaseCopyService = require("./BaseCopyService");
const handleFileUploads = require("../utils/FileUploads");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const ProcurementNotificationService = require("./procurementNotification");

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

// Enhanced sendRFQNotification with proper file naming and procurement notification service
const sendRFQNotification = async ({
  vendor,
  rfq,
  currentUser,
  pdfUrl,
  existingPDF,
}) => {
  try {
    const downloadFilename = `${rfq.RFQCode}.pdf`;
    const downloadUrl = `${process.env.API_BASE_URL}/files/${existingPDF._id}/download`;

    await ProcurementNotificationService.sendRFQNotification({
      vendor,
      rfq,
      currentUser,
      downloadUrl,
      downloadFilename,
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
