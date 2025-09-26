"use strict";

const Vendor = require("../models/VendorModel");
const ExcelJS = require("exceljs");

const generateVendorsExcelReport = async (res) => {
  try {
    // Get all vendors
    const vendors = await Vendor.find({}).sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Vendors");

    // Define headers
    const headers = [
      "Vendor Code",
      "Business Name",
      "Business Type",
      "Contact Person",
      "Position",
      "Email",
      "Business Phone",
      "Contact Phone",
      "Address",
      "Supplier Number",
      "TIN Number",
      "Categories",
      "Date Created",
    ];
    // ===== TITLE SECTION =====
    // Main Title (merged across all columns)
    worksheet.mergeCells("A1:M1");
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = "CASFOD Procurement Vendors List";
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { horizontal: "center", vertical: "center" };
    titleRow.height = 25;

    // Report Date (merged)
    worksheet.mergeCells("A2:M2");
    const dateRow = worksheet.getRow(2);
    dateRow.getCell(1).value = `REPORT DATE: ${new Date().toDateString()}`;
    dateRow.font = { bold: true };
    dateRow.alignment = { horizontal: "left" };

    // Total Vendors (merged)
    worksheet.mergeCells("A3:M3");
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
        vendor.contactPerson || "",
        vendor.position || "",
        vendor.email || "",
        vendor.businessPhoneNumber || "",
        vendor.contactPhoneNumber || "",
        vendor.address || "",
        vendor.supplierNumber || "",
        vendor.tinNumber || "",
        vendor.categories ? vendor.categories.join(", ") : "",
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
    // headerRow.height = 10;

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
      // Set column widths with reasonable min/max
      const calculatedWidth = Math.min(Math.max(maxLength + 2, 12), 30);
      column.width = calculatedWidth;
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
