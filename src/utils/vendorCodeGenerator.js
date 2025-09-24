const Vendor = require("../models/VendorModel");

/**
 * Generate vendor code from business name (8 characters)
 * Format: First 3 letters of business name + sequential number
 * Example: TEC00001, TEC00002, etc.
 */
const generateVendorCode = async (businessName) => {
  if (!businessName || businessName.length < 3) {
    throw new Error("Business name must be at least 3 characters long");
  }

  // Extract first 3 letters and convert to uppercase
  const prefix = businessName
    .substring(0, 3)
    .replace(/[^A-Za-z]/g, "") // Remove non-alphabet characters
    .toUpperCase();

  // If after filtering we have less than 3 characters, pad with 'X'
  const finalPrefix = prefix.padEnd(3, "X").substring(0, 3);

  // Find the highest sequential number for this prefix
  const latestVendor = await Vendor.findOne({
    vendorCode: new RegExp(`^${finalPrefix}\\d{5}$`),
  }).sort({ vendorCode: -1 });

  let sequentialNumber = 1;

  if (latestVendor) {
    const lastNumber = parseInt(latestVendor.vendorCode.substring(3), 10);
    sequentialNumber = lastNumber + 1;
  }

  // Ensure sequential number is 5 digits (00001 to 99999)
  if (sequentialNumber > 99999) {
    throw new Error("Vendor code sequence exceeded for this prefix");
  }

  const sequentialPart = sequentialNumber.toString().padStart(5, "0");
  const vendorCode = `${finalPrefix}${sequentialPart}`;

  // Double-check uniqueness
  const existingVendor = await Vendor.findOne({ vendorCode });
  if (existingVendor) {
    // Recursively try again (should be very rare)
    return generateVendorCode(businessName);
  }

  return vendorCode;
};

/**
 * Validate phone number format (exactly 11 digits)
 */
const validatePhoneNumber = (phoneNumber) => {
  if (!phoneNumber || typeof phoneNumber !== "string") {
    return false;
  }

  // Remove any non-digit characters and check length
  const cleanedNumber = phoneNumber.replace(/\D/g, "");
  return cleanedNumber.length === 11;
};

/**
 * Format phone number to ensure it's exactly 11 digits
 */
const formatPhoneNumber = (phoneNumber) => {
  if (!phoneNumber) return phoneNumber;

  // Remove all non-digit characters
  const cleanedNumber = phoneNumber.replace(/\D/g, "");

  // Ensure exactly 11 digits
  if (cleanedNumber.length !== 11) {
    throw new Error("Phone number must be exactly 11 digits");
  }

  return cleanedNumber;
};

module.exports = {
  generateVendorCode,
  validatePhoneNumber,
  formatPhoneNumber,
};
