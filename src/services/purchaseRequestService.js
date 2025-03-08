const PurchaseRequest = require("../models/PurchaseRequest");

// Create a new purchase request
const createPurchaseRequest = async (data) => {
  const purchaseRequest = new PurchaseRequest(data);
  return await purchaseRequest.save();
};

// Save a purchase request (draft)
const savePurchaseRequest = async (data) => {
  const purchaseRequest = new PurchaseRequest({ ...data, status: "draft" });
  return await purchaseRequest.save();
};

// Save and send a purchase request (pending)
const saveAndSendPurchaseRequest = async (data) => {
  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }
  const purchaseRequest = new PurchaseRequest({ ...data, status: "pending" });
  return await purchaseRequest.save();
};

// Get all purchase requests
const getPurchaseRequests = async (currentUser) => {
  let query = {};

  // Role-based filtering
  switch (currentUser.role) {
    case "STAFF":
      // STAFF can only see their own purchase requests
      query = { createdBy: currentUser._id };
      break;

    case "ADMIN":
      // ADMIN can see their own requests or requests they reviewed
      query = {
        $or: [
          { createdBy: currentUser._id }, // Requests they created
          { reviewedBy: currentUser._id }, // Requests they reviewed
        ],
      };
      break;

    case "SUPER-ADMIN":
      // SUPER-ADMIN can see everything except "draft" status
      query = { status: { $ne: "draft" } }; // Exclude "draft" status
      break;

    default:
      throw new Error("Invalid user role");
  }

  // Fetch purchase requests based on the query
  return await PurchaseRequest.find(query).populate(
    "createdBy",
    "username email"
  );
};

// Get a single purchase request by ID
const getPurchaseRequestById = async (id) => {
  return await PurchaseRequest.findById(id).populate(
    "createdBy",
    "username email"
  );
};

// Update a purchase request
const updatePurchaseRequest = async (id, data) => {
  return await PurchaseRequest.findByIdAndUpdate(id, data, { new: true });
};

// Delete a purchase request
const deletePurchaseRequest = async (id) => {
  return await PurchaseRequest.findByIdAndDelete(id);
};

module.exports = {
  createPurchaseRequest,
  savePurchaseRequest,
  saveAndSendPurchaseRequest,
  getPurchaseRequests,
  getPurchaseRequestById,
  updatePurchaseRequest,
  deletePurchaseRequest,
};
