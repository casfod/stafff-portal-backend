"use strict";

const User = require("../models/UserModel");
const ExcelJS = require("exceljs");

const generateUsersExcelReport = async (res) => {
  try {
    // Get all users
    const users = await User.find({ isDeleted: { $ne: true } }).sort({
      createdAt: -1,
    });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Users");

    // Define headers - updated to match UserModel structure
    const headers = [
      "First Name",
      "Last Name",
      "Email",
      "Role",
      "Position",
      "Employment Status",
      "Job Title",
      "Staff ID",
      "Work Location",
      "Work Email",
      "Work Phone",
      "Start Date",
      "End Date",
      "Supervisor",
      "Full Name",
      "State of Origin",
      "LGA",
      "Religion",
      "Address",
      "Home Phone",
      "Cell Phone",
      "NIN Number",
      "Birth Date",
      "Marital Status",
      "Spouse Name",
      "Spouse Address",
      "Spouse Phone",
      "Number of Children",
      "Emergency Contact Name",
      "Emergency Address",
      "Emergency Primary Phone",
      "Emergency Cell Phone",
      "Emergency Relationship",
      "Bank Name",
      "Account Name",
      "Account Number",
      "Bank Sort Code",
      "Procurement: Create",
      "Procurement: View",
      "Procurement: Update",
      "Procurement: Delete",
      "Finance: Create",
      "Finance: View",
      "Finance: Update",
      "Finance: Delete",
      "Date Created",
    ];

    // ===== TITLE SECTION =====
    // Main Title (merged across all columns)
    worksheet.mergeCells(`A1:${String.fromCharCode(64 + headers.length)}1`);
    const titleRow = worksheet.getRow(1);
    titleRow.getCell(1).value = "CASFOD Staff List";
    titleRow.font = { bold: true, size: 16 };
    titleRow.alignment = { horizontal: "center", vertical: "center" };
    titleRow.height = 25;

    // Report Date (merged)
    worksheet.mergeCells(`A2:${String.fromCharCode(64 + headers.length)}2`);
    const dateRow = worksheet.getRow(2);
    dateRow.getCell(1).value = `REPORT DATE: ${new Date().toDateString()}`;
    dateRow.font = { bold: true };
    dateRow.alignment = { horizontal: "left" };

    // Total Users (merged)
    worksheet.mergeCells(`A3:${String.fromCharCode(64 + headers.length)}3`);
    const countRow = worksheet.getRow(3);
    countRow.getCell(1).value = `TOTAL STAFF: ${users.length}`;
    countRow.font = { bold: true };
    countRow.alignment = { horizontal: "left" };

    // Empty row for spacing
    worksheet.addRow([]);

    // ===== HEADERS SECTION =====
    const headerRow = worksheet.addRow(headers);

    // ===== DATA SECTION =====
    users.forEach((user) => {
      worksheet.addRow([
        // Basic Info
        user.first_name || "",
        user.last_name || "",
        user.email || "",
        user.role || "",
        user.position || "",

        // Employment Info Status
        user.employmentInfo?.isEmploymentInfoLocked ? "Locked" : "Editable",

        // Job Details
        user.employmentInfo?.jobDetails?.title || "",
        user.employmentInfo?.jobDetails?.idNo || "",
        user.employmentInfo?.jobDetails?.workLocation || "",
        user.employmentInfo?.jobDetails?.workEmail || "",
        user.employmentInfo?.jobDetails?.workPhone || "",
        user.employmentInfo?.jobDetails?.startDate
          ? new Date(user.employmentInfo.jobDetails.startDate).toDateString()
          : "",
        user.employmentInfo?.jobDetails?.endDate
          ? new Date(user.employmentInfo.jobDetails.endDate).toDateString()
          : "",
        user.employmentInfo?.jobDetails?.supervisor || "",

        // Personal Details
        user.employmentInfo?.personalDetails?.fullName || "",
        user.employmentInfo?.personalDetails?.stateOfOrigin || "",
        user.employmentInfo?.personalDetails?.lga || "",
        user.employmentInfo?.personalDetails?.religion || "",
        user.employmentInfo?.personalDetails?.address || "",
        user.employmentInfo?.personalDetails?.homePhone || "",
        user.employmentInfo?.personalDetails?.cellPhone || "",
        user.employmentInfo?.personalDetails?.ninNumber || "",
        user.employmentInfo?.personalDetails?.birthDate
          ? new Date(
              user.employmentInfo.personalDetails.birthDate
            ).toDateString()
          : "",
        user.employmentInfo?.personalDetails?.maritalStatus || "",
        user.employmentInfo?.personalDetails?.spouseName || "",
        user.employmentInfo?.personalDetails?.spouseAddress || "",
        user.employmentInfo?.personalDetails?.spousePhone || "",
        user.employmentInfo?.personalDetails?.numberOfChildren || "",

        // Emergency Contact
        user.employmentInfo?.emergencyContact?.fullName || "",
        user.employmentInfo?.emergencyContact?.address || "",
        user.employmentInfo?.emergencyContact?.primaryPhone || "",
        user.employmentInfo?.emergencyContact?.cellPhone || "",
        user.employmentInfo?.emergencyContact?.relationship || "",

        // Bank Details
        user.employmentInfo?.bankDetails?.bankName || "",
        user.employmentInfo?.bankDetails?.accountName || "",
        user.employmentInfo?.bankDetails?.accountNumber || "",
        user.employmentInfo?.bankDetails?.bankSortCode || "",

        // Procurement Permissions
        user.procurementRole?.canCreate ? "Yes" : "No",
        user.procurementRole?.canView ? "Yes" : "No",
        user.procurementRole?.canUpdate ? "Yes" : "No",
        user.procurementRole?.canDelete ? "Yes" : "No",

        // Finance Permissions
        user.financeRole?.canCreate ? "Yes" : "No",
        user.financeRole?.canView ? "Yes" : "No",
        user.financeRole?.canUpdate ? "Yes" : "No",
        user.financeRole?.canDelete ? "Yes" : "No",

        // Date Created
        user.createdAt ? new Date(user.createdAt).toDateString() : "",
      ]);
    });

    // ===== STYLING =====
    // Style the header row
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
      const headerText = headers[index] || "";

      if (headerText.includes("Email") || headerText.includes("Address")) {
        columnWidth = 25;
      } else if (
        headerText.includes("Name") ||
        headerText.includes("Position") ||
        headerText.includes("Title")
      ) {
        columnWidth = 18;
      } else if (
        headerText.includes("Phone") ||
        headerText.includes("NIN") ||
        headerText.includes("Account")
      ) {
        columnWidth = 15;
      } else if (
        headerText.includes("Procurement") ||
        headerText.includes("Finance")
      ) {
        columnWidth = 12;
      } else if (headerText.includes("Date")) {
        columnWidth = 12;
      } else {
        columnWidth = Math.min(Math.max(maxLength + 2, 12), 30);
      }

      column.width = columnWidth;
    });

    // Add borders to data rows only (headers + user data)
    const headerRowNum = 5;
    const dataEndRow = headerRowNum + users.length;

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
      `attachment; filename=users_export_${Date.now()}.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error("Error generating users Excel report:", error);
    throw new Error("Failed to generate Excel report");
  }
};

module.exports = {
  generateUsersExcelReport,
};
