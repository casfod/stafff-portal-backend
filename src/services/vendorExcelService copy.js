"use strict";

const Vendor = require("../models/VendorModel");
const ExcelJS = require("exceljs");

const generateVendorsExcelReport = async (res) => {
  try {
    // Get all vendors (you might want to add filters later)
    const vendors = await Vendor.find({}).sort({ createdAt: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Vendors");

    // Add title and report info
    worksheet.addRows([
      ["Vendors Master List"],
      ["REPORT DATE:", new Date().toDateString()],
      ["TOTAL VENDORS:", vendors.length],
      [], // Empty row for spacing
    ]);

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

    worksheet.addRow(headers);

    // Add vendor data
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

    // Style the header row
    const headerRow = worksheet.getRow(5);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF2F75B5" },
    };
    headerRow.alignment = { horizontal: "center" };

    // Style title row
    const titleRow = worksheet.getRow(1);
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { horizontal: "center" };

    // Style info rows
    for (let i = 2; i <= 4; i++) {
      const infoRow = worksheet.getRow(i);
      infoRow.font = { bold: true };
    }

    // Auto-fit columns
    worksheet.columns.forEach((column) => {
      let maxLength = 0;
      column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? cell.value.toString().length : 10;
        if (columnLength > maxLength) {
          maxLength = columnLength;
        }
      });
      column.width = Math.min(Math.max(maxLength + 2, 10), 50);
    });

    // Add borders to data rows
    const dataStartRow = 5;
    const dataEndRow = 5 + vendors.length;

    for (let i = dataStartRow; i <= dataEndRow; i++) {
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

    // Set response headers
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=vendors_export_${Date.now()}.xlsx`
    );

    // Write to response
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
