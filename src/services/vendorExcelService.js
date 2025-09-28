"use strict";

const Vendor = require("../models/VendorModel");
const ExcelJS = require("exceljs");

const generateVendorsExcelReport = async (res) => {
  try {
    // Get all vendors
    const vendors = await Vendor.find({}).sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Vendors");

    // Define headers - updated to match current VendorModel
    const headers = [
      "Vendor Code",
      "Business Name",
      "Business Type",
      "Business Registration Number",
      "Business State",
      "Operating LGA",
      "TIN Number",
      "Categories",
      "Contact Person",
      "Position",
      "Email",
      "Business Phone",
      "Contact Phone",
      "Address",
      "Bank Name",
      "Account Name",
      "Account Number",
      "Date Created",
    ];

    // ===== TITLE SECTION =====
    // Main Title (merged across all columns)
    worksheet.mergeCells("A1:R1");
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = "CASFOD Procurement Vendors List";
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { horizontal: "center", vertical: "center" };
    titleRow.height = 25;

    // Report Date (merged)
    worksheet.mergeCells("A2:R2");
    const dateRow = worksheet.getRow(2);
    dateRow.getCell(1).value = `REPORT DATE: ${new Date().toDateString()}`;
    dateRow.font = { bold: true };
    dateRow.alignment = { horizontal: "left" };

    // Total Vendors (merged)
    worksheet.mergeCells("A3:R3");
    const countRow = worksheet.getRow(3);
    countRow.getCell(1).value = `TOTAL VENDORS: ${vendors.length}`;
    countRow.font = { bold: true };
    countRow.alignment = { horizontal: "left" };

    // Empty row for spacing
    worksheet.addRow([]);

    // ===== HEADERS SECTION =====
    const headerRow = worksheet.addRow(headers);

    // ===== DATA SECTION =====
    vendors.forEach((vendor) => {
      worksheet.addRow([
        vendor.vendorCode || "",
        vendor.businessName || "",
        vendor.businessType || "",
        vendor.businessRegNumber || "",
        vendor.businessState || "",
        vendor.operatingLGA || "",
        vendor.tinNumber || "",
        vendor.categories ? vendor.categories.join(", ") : "",
        vendor.contactPerson || "",
        vendor.position || "",
        vendor.email || "",
        vendor.businessPhoneNumber || "",
        vendor.contactPhoneNumber || "",
        vendor.address || "",
        vendor.bankName || "",
        vendor.accountName || "",
        vendor.accountNumber || "",
        vendor.createdAt ? vendor.createdAt.toDateString() : "",
      ]);
    });

    // ===== STYLING =====
    // Style the header row (row 5)
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2F75B5" },
    };
    headerRow.alignment = { horizontal: "center", vertical: "center" };

    // Auto-fit columns with reasonable limits
    worksheet.columns.forEach((column, index) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        // Skip title rows for width calculation
        if (cell.row > 4) {
          // Only consider data rows (starting from row 5)
          const columnLength = cell.value ? cell.value.toString().length : 10;
          if (columnLength > maxLength) {
            maxLength = columnLength;
          }
        }
      });

      // Set specific widths for certain columns
      let columnWidth;
      switch (index) {
        case 0: // Vendor Code
          columnWidth = 12;
          break;
        case 1: // Business Name
          columnWidth = 25;
          break;
        case 3: // Business Registration Number
          columnWidth = 20;
          break;
        case 4: // Business State
          columnWidth = 15;
          break;
        case 5: // Operating LGA
          columnWidth = 15;
          break;
        case 6: // TIN Number
          columnWidth = 15;
          break;
        case 7: // Categories
          columnWidth = 20;
          break;
        case 8: // Contact Person
          columnWidth = 18;
          break;
        case 9: // Position
          columnWidth = 15;
          break;
        case 10: // Email
          columnWidth = 25;
          break;
        case 11: // Business Phone
        case 12: // Contact Phone
          columnWidth = 15;
          break;
        case 13: // Address
          columnWidth = 30;
          break;
        case 14: // Bank Name
          columnWidth = 20;
          break;
        case 15: // Account Name
          columnWidth = 20;
          break;
        case 16: // Account Number
          columnWidth = 15;
          break;
        case 17: // Date Created
          columnWidth = 12;
          break;
        default:
          columnWidth = Math.min(Math.max(maxLength + 2, 12), 30);
      }

      column.width = columnWidth;
    });

    // Add borders to data rows only (headers + vendor data)
    const headerRowNum = 5;
    const dataEndRow = headerRowNum + vendors.length;

    for (let i = headerRowNum; i <= dataEndRow; i++) {
      const row = worksheet.getRow(i);
      row.alignment = { vertical: "top" };

      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    }

    // ===== EXPORT =====
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=vendors_export_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating vendors Excel report:", error);
    throw new Error("Failed to generate Excel report");
  }
};

module.exports = {
  generateVendorsExcelReport,
};
