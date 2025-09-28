const Vendor = require("../models/VendorModel");

/**
 * Generate vendor code from business name (6 characters)
 * Format: First 3 letters of business name + 3 random digits
 * Example: TEC123, TEC456, etc.
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

  // Generate 3 random digits
  const generateRandomDigits = () => {
    return Math.floor(100 + Math.random() * 900).toString(); // 100-999
  };

  let vendorCode;
  let attempts = 0;
  const maxAttempts = 10;

  // Keep generating until we get a unique code or reach max attempts
  do {
    const randomDigits = generateRandomDigits();
    vendorCode = `${finalPrefix}${randomDigits}`;
    attempts++;

    // Check if this vendor code already exists
    const existingVendor = await Vendor.findOne({ vendorCode });

    if (!existingVendor) {
      return vendorCode;
    }

    // If we've tried too many times, throw an error
    if (attempts >= maxAttempts) {
      throw new Error(
        `Unable to generate unique vendor code after ${maxAttempts} attempts`
      );
    }
  } while (true);
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
