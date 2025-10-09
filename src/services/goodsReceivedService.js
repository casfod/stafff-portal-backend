// goodsReceivedService.js - Updated with filtering and file upload
const GoodsReceived = require("../models/GooodsRecievedModel");
const PurchaseOrder = require("../models/PurchaseOrderModel");
const fileService = require("./fileService");
const handleFileUploads = require("../utils/FileUploads");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");

/**
 * Create or Update Goods Received Note
 */
const createGoodsReceived = async (
  goodsReceivedData,
  currentUser,
  files = []
) => {
  const { purchaseOrder, GRNitems } = goodsReceivedData;

  // Validate purchase order exists
  const po = await PurchaseOrder.findById(purchaseOrder);
  if (!po) {
    throw new Error("Purchase Order not found");
  }

  // Check if GRN already exists for this purchase order
  const existingGRN = await GoodsReceived.findOne({ purchaseOrder });

  let goodsReceived;
  if (existingGRN) {
    goodsReceived = await updateExistingGRN(existingGRN, GRNitems, po);
  } else {
    goodsReceived = await createNewGRN(
      goodsReceivedData,
      GRNitems,
      po,
      currentUser
    );
  }

  // Handle file uploads
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: goodsReceived._id,
      modelTable: "GoodsReceived",
    });
  }

  // Populate with files for response
  const filesData = await fileService.getFilesByDocument(
    "GoodsReceived",
    goodsReceived._id
  );

  const populatedGRN = await goodsReceived.populate([
    {
      path: "purchaseOrder",
      populate: [
        { path: "selectedVendor" },
        { path: "createdBy", select: "email first_name last_name role" },
      ],
    },
    { path: "createdBy", select: "email first_name last_name role" },
  ]);

  return {
    goodsReceived: normalizeId({
      ...populatedGRN.toObject(),
      files: normalizeFiles(filesData),
    }),
    message: existingGRN
      ? "Goods Received Note updated successfully"
      : "Goods Received Note created successfully",
  };
};

/**
 * Update existing GRN
 */
const updateExistingGRN = async (existingGRN, newGRNitems, purchaseOrder) => {
  // Check if GRN is completed (all items fully received)
  if (existingGRN.isCompleted) {
    throw new Error("Cannot update GRN. All items are already fully received.");
  }

  // Validate that all itemids exist in the purchase order
  const poItemIds = purchaseOrder.itemGroups.map(
    (item) => item._id?.toString() || item.id
  );
  const invalidItems = newGRNitems.filter(
    (item) => !poItemIds.includes(item.itemid)
  );

  if (invalidItems.length > 0) {
    throw new Error(
      `Invalid items found: ${invalidItems
        .map((item) => item.itemid)
        .join(", ")}`
    );
  }

  // Create a map of existing items for quick lookup
  const existingItemsMap = new Map();
  existingGRN.GRNitems.forEach((item) => {
    existingItemsMap.set(item.itemid, item);
  });

  // Update items, preserving fully received items
  const updatedItems = newGRNitems.map((newItem) => {
    const existingItem = existingItemsMap.get(newItem.itemid);

    // If item was already fully received, keep the original values
    if (existingItem && existingItem.isFullyReceived) {
      return existingItem;
    }

    // Calculate new values for non-fully received items
    const numberReceived = Math.min(
      newItem.numberReceived,
      newItem.numberOrdered
    );
    const difference = newItem.numberOrdered - numberReceived;
    const isFullyReceived = difference === 0;

    return {
      itemid: newItem.itemid,
      numberOrdered: newItem.numberOrdered,
      numberReceived: numberReceived,
      difference: difference,
      isFullyReceived: isFullyReceived,
    };
  });

  // Update the GRN
  existingGRN.GRNitems = updatedItems;
  await existingGRN.save();

  return await existingGRN.populate([
    { path: "purchaseOrder", populate: { path: "selectedVendor" } },
    { path: "createdBy", select: "email first_name last_name role" },
  ]);
};

/**
 * Create new GRN
 */
const createNewGRN = async (
  goodsReceivedData,
  GRNitems,
  purchaseOrder,
  currentUser
) => {
  // Validate that all itemids exist in the purchase order
  const poItemIds = purchaseOrder.itemGroups.map(
    (item) => item._id?.toString() || item.id
  );
  const invalidItems = GRNitems.filter(
    (item) => !poItemIds.includes(item.itemid)
  );

  if (invalidItems.length > 0) {
    throw new Error(
      `Invalid items found: ${invalidItems
        .map((item) => item.itemid)
        .join(", ")}`
    );
  }

  // Calculate initial items with status
  const itemsWithStatus = GRNitems.map((item) => {
    const numberReceived = Math.min(item.numberReceived, item.numberOrdered);
    const difference = item.numberOrdered - numberReceived;
    const isFullyReceived = difference === 0;

    return {
      ...item,
      numberReceived: numberReceived,
      difference: difference,
      isFullyReceived: isFullyReceived,
    };
  });

  const goodsReceived = new GoodsReceived({
    ...goodsReceivedData,
    GRNitems: itemsWithStatus,
    createdBy: currentUser.id,
  });

  await goodsReceived.save();

  return await goodsReceived.populate([
    { path: "purchaseOrder", populate: { path: "selectedVendor" } },
    { path: "createdBy", select: "email first_name last_name role" },
  ]);
};

/**
 * Get all Goods Received Notes
 */
const getGoodsReceivedNotes = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 10 } = queryParams;

  const searchFields = ["GRDCode", "status"];

  // Build search query same as purchase orders
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  // Role-based filtering same as purchase orders
  switch (currentUser.role) {
    case "STAFF":
      query.createdBy = currentUser._id;
      break;
    case "ADMIN":
    case "SUPER-ADMIN":
      // Admins can see all goods received notes
      break;
    default:
      query.createdBy = currentUser._id;
      break;
  }

  const sortQuery = buildSortQuery(sort);
  const populateOptions = [
    {
      path: "purchaseOrder",
      populate: [
        { path: "selectedVendor" },
        { path: "createdBy", select: "email first_name last_name role" },
      ],
    },
    { path: "createdBy", select: "email first_name last_name role" },
  ];

  const {
    results: goodsReceived,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    GoodsReceived,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  // Get files for each goods received note
  const goodsReceivedWithFiles = await Promise.all(
    goodsReceived.map(async (grn) => {
      const files = await fileService.getFilesByDocument(
        "GoodsReceived",
        grn._id
      );
      return {
        ...grn.toJSON(),
        files: normalizeFiles(files),
      };
    })
  );

  return {
    goodsReceived: goodsReceivedWithFiles,
    total,
    totalPages,
    currentPage,
    totalCount: total,
  };
};

/**
 * Get Goods Received Note by ID
 */
const getGoodsReceivedById = async (id) => {
  const goodsReceived = await GoodsReceived.findById(id).populate([
    {
      path: "purchaseOrder",
      populate: [
        { path: "selectedVendor" },
        { path: "createdBy", select: "email first_name last_name role" },
      ],
    },
    { path: "createdBy", select: "email first_name last_name role" },
  ]);

  if (!goodsReceived) {
    throw new Error("Goods Received Note not found");
  }

  // Get files and add them to the goodsReceived object
  const files = await fileService.getFilesByDocument("GoodsReceived", id);

  // Convert to plain object and add files
  const goodsReceivedWithFiles = {
    ...goodsReceived.toObject(),
    files: normalizeFiles(files),
  };

  return {
    goodsReceived: goodsReceivedWithFiles, // Now includes files
    message: "Goods Received Note fetched successfully",
  };
};

/**
 * Update Goods Received Note
 */
const updateGoodsReceived = async (id, updateData, currentUser, files = []) => {
  const { GRNitems, ...otherData } = updateData;

  const goodsReceived = await GoodsReceived.findById(id);
  if (!goodsReceived) {
    throw new Error("Goods Received Note not found");
  }

  // If GRN is completed, prevent updates
  if (goodsReceived.isCompleted) {
    throw new Error("Cannot update GRN. All items are fully received.");
  }

  // If GRNitems are being updated, process them
  if (GRNitems && Array.isArray(GRNitems)) {
    const po = await PurchaseOrder.findById(goodsReceived.purchaseOrder);
    if (!po) {
      throw new Error("Purchase Order not found");
    }

    otherData.GRNitems = await processGRNItems(
      GRNitems,
      goodsReceived.GRNitems,
      po
    );
  }

  const updatedGoodsReceived = await GoodsReceived.findByIdAndUpdate(
    id,
    otherData,
    {
      new: true,
      runValidators: true,
    }
  );

  // Handle file uploads - replace existing files
  if (files.length > 0) {
    await fileService.deleteFilesByDocument("GoodsReceived", id);
    await handleFileUploads({
      files,
      requestId: updatedGoodsReceived._id,
      modelTable: "GoodsReceived",
    });
  }

  // Populate for response
  await updatedGoodsReceived.populate([
    {
      path: "purchaseOrder",
      populate: [
        { path: "selectedVendor" },
        { path: "createdBy", select: "email first_name last_name role" },
      ],
    },
    { path: "createdBy", select: "email first_name last_name role" },
  ]);

  const filesData = await fileService.getFilesByDocument("GoodsReceived", id);

  return {
    goodsReceived: normalizeId({
      ...updatedGoodsReceived.toObject(),
      files: normalizeFiles(filesData),
    }),
    message: "Goods Received Note updated successfully",
  };
};

/**
 * Process GRN items for update, preserving fully received items
 */
const processGRNItems = async (newItems, existingItems, purchaseOrder) => {
  // Validate that all itemids exist in the purchase order
  const poItemIds = purchaseOrder.itemGroups.map(
    (item) => item._id?.toString() || item.id
  );
  const invalidItems = newItems.filter(
    (item) => !poItemIds.includes(item.itemid)
  );

  if (invalidItems.length > 0) {
    throw new Error(
      `Invalid items found: ${invalidItems
        .map((item) => item.itemid)
        .join(", ")}`
    );
  }

  // Create a map of existing items for quick lookup
  const existingItemsMap = new Map();
  existingItems.forEach((item) => {
    existingItemsMap.set(item.itemid, item);
  });

  // Process each item
  return newItems.map((newItem) => {
    const existingItem = existingItemsMap.get(newItem.itemid);

    // If item was already fully received, keep the original values
    if (existingItem && existingItem.isFullyReceived) {
      return existingItem;
    }

    // Calculate new values for non-fully received items
    const numberReceived = Math.min(
      newItem.numberReceived,
      newItem.numberOrdered
    );
    const difference = newItem.numberOrdered - numberReceived;
    const isFullyReceived = difference === 0;

    return {
      itemid: newItem.itemid,
      numberOrdered: newItem.numberOrdered,
      numberReceived: numberReceived,
      difference: difference,
      isFullyReceived: isFullyReceived,
    };
  });
};

/**
 * Delete Goods Received Note
 */
const deleteGoodsReceived = async (id) => {
  const goodsReceived = await GoodsReceived.findByIdAndDelete(id);

  if (!goodsReceived) {
    throw new Error("Goods Received Note not found");
  }

  return {
    goodsReceived,
    message: "Goods Received Note deleted successfully",
  };
};

/**
 * Get Goods Received Notes by Purchase Order
 */
const getGoodsReceivedByPurchaseOrder = async (purchaseOrderId) => {
  const goodsReceived = await GoodsReceived.find({
    purchaseOrder: purchaseOrderId,
  })
    .populate([
      { path: "purchaseOrder", populate: { path: "selectedVendor" } },
      { path: "createdBy", select: "email first_name last_name role" },
    ])
    .sort({ createdAt: -1 });

  return {
    goodsReceived,
    message: "Goods Received Notes fetched successfully",
    total: goodsReceived.length,
    totalCount: goodsReceived.length,
  };
};

/**
 * Check if GRN exists for Purchase Order
 */
const checkGRNExists = async (purchaseOrderId) => {
  const grn = await GoodsReceived.findOne({ purchaseOrder: purchaseOrderId });
  return {
    exists: !!grn,
    grn: grn,
    isCompleted: grn ? grn.isCompleted : false,
    message: "GRN status checked successfully",
  };
};

/**
 * Calculate summary statistics for Goods Received
 */
const getGoodsReceivedSummary = async (purchaseOrderId = null) => {
  const matchStage = purchaseOrderId ? { purchaseOrder: purchaseOrderId } : {};

  const summary = await GoodsReceived.aggregate([
    { $match: matchStage },
    { $unwind: "$GRNitems" },
    {
      $group: {
        _id: null,
        totalItemsOrdered: { $sum: "$GRNitems.numberOrdered" },
        totalItemsReceived: { $sum: "$GRNitems.numberReceived" },
        totalDifferences: { $sum: "$GRNitems.difference" },
        fullyReceivedItems: {
          $sum: {
            $cond: ["$GRNitems.isFullyReceived", 1, 0],
          },
        },
        averageReceiptRate: {
          $avg: {
            $divide: ["$GRNitems.numberReceived", "$GRNitems.numberOrdered"],
          },
        },
      },
    },
  ]);

  const result = summary[0] || {
    totalItemsOrdered: 0,
    totalItemsReceived: 0,
    totalDifferences: 0,
    fullyReceivedItems: 0,
    averageReceiptRate: 0,
  };

  return {
    summary: result,
    message: "Goods Received summary fetched successfully",
  };
};
const addFilesToGoodsReceived = async (id, files, currentUser) => {
  const goodsReceived = await GoodsReceived.findById(id);
  if (!goodsReceived) {
    throw new Error("Goods Received Note not found");
  }

  if (files.length > 0) {
    await fileService.deleteFilesByDocument("GoodsReceived", id);

    await handleFileUploads({
      files,
      requestId: goodsReceived._id,
      modelTable: "GoodsReceived",
    });
  }

  // Get updated files list
  const filesData = await fileService.getFilesByDocument("GoodsReceived", id);

  await goodsReceived.populate([
    {
      path: "purchaseOrder",
      populate: [
        { path: "selectedVendor" },
        { path: "createdBy", select: "email first_name last_name role" },
      ],
    },
    { path: "createdBy", select: "email first_name last_name role" },
  ]);

  return {
    goodsReceived: normalizeId({
      ...goodsReceived.toObject(),
      files: normalizeFiles(filesData),
    }),
    message: "Files added to Goods Received Note successfully",
  };
};

module.exports = {
  createGoodsReceived,
  getGoodsReceivedNotes,
  getGoodsReceivedById,
  updateGoodsReceived,
  deleteGoodsReceived,
  getGoodsReceivedByPurchaseOrder,
  getGoodsReceivedSummary,
  checkGRNExists,
  addFilesToGoodsReceived, // New function for dedicated file upload
};
