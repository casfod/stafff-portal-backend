import { Response } from 'express';
import ExcelJS from 'exceljs';
import { User } from '../models';

const HEADERS = [
  'First Name', 'Last Name', 'Email', 'Role', 'Position', 'Employment Status',
  'Job Title', 'Staff ID', 'Work Location', 'Work Email', 'Work Phone',
  'Start Date', 'End Date', 'Supervisor',
  'Full Name', 'State of Origin', 'LGA', 'Religion', 'Address',
  'Home Phone', 'Cell Phone', 'NIN Number', 'Birth Date', 'Marital Status',
  'Spouse Name', 'Spouse Address', 'Spouse Phone', 'Number of Children',
  'Emergency Contact Name', 'Emergency Address', 'Emergency Primary Phone',
  'Emergency Cell Phone', 'Emergency Relationship',
  'Bank Name', 'Account Name', 'Account Number', 'Bank Sort Code',
  'Procurement: Create', 'Procurement: View', 'Procurement: Update', 'Procurement: Delete',
  'Finance: Create', 'Finance: View', 'Finance: Update', 'Finance: Delete',
  'Date Created',
] as const;

// ─── Style helpers ────────────────────────────────────────────────────────────
function colWidth(header: string): number {
  if (header.includes('Email') || header.includes('Address')) return 25;
  if (header.includes('Name') || header.includes('Position') || header.includes('Title')) return 18;
  if (header.includes('Phone') || header.includes('NIN') || header.includes('Account')) return 15;
  if (header.includes('Procurement') || header.includes('Finance')) return 12;
  if (header.includes('Date')) return 12;
  return 14;
}

function dateStr(d: Date | undefined): string {
  return d ? new Date(d).toDateString() : '';
}

function yesNo(v: boolean | undefined): string {
  return v ? 'Yes' : 'No';
}

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateUsersExcelReport(res: Response): Promise<void> {
  const users = await User.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });

  const wb   = new ExcelJS.Workbook();
  const ws   = wb.addWorksheet('Users');
  const cols  = HEADERS.length;
  const lastCol = String.fromCharCode(64 + cols);

  // ── Title block ──────────────────────────────────────────────────────────
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getRow(1).getCell(1).value     = 'CASFOD Staff List';
  ws.getRow(1).font                  = { bold: true, size: 16 };
  ws.getRow(1).alignment             = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height                = 25;

  ws.mergeCells(`A2:${lastCol}2`);
  ws.getRow(2).getCell(1).value     = `REPORT DATE: ${new Date().toDateString()}`;
  ws.getRow(2).font                  = { bold: true };

  ws.mergeCells(`A3:${lastCol}3`);
  ws.getRow(3).getCell(1).value     = `TOTAL STAFF: ${users.length}`;
  ws.getRow(3).font                  = { bold: true };

  ws.addRow([]); // spacer

  // ── Header row ────────────────────────────────────────────────────────────
  const headerRow = ws.addRow(HEADERS as unknown as any[]);
  headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F75B5' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // ── Data rows ─────────────────────────────────────────────────────────────
  for (const u of users) {
    const ei = u.employmentInfo;
    ws.addRow([
      u.firstName,
      u.lastName,
      u.email,
      u.role,
      u.position ?? '',
      ei?.isEmploymentInfoLocked ? 'Locked' : 'Editable',
      ei?.jobDetails?.title          ?? '',
      ei?.jobDetails?.idNo           ?? '',
      ei?.jobDetails?.workLocation   ?? '',
      ei?.jobDetails?.workEmail      ?? '',
      ei?.jobDetails?.workPhone      ?? '',
      dateStr(ei?.jobDetails?.startDate),
      dateStr(ei?.jobDetails?.endDate),
      ei?.jobDetails?.supervisor     ?? '',
      ei?.personalDetails?.fullName       ?? '',
      ei?.personalDetails?.stateOfOrigin  ?? '',
      ei?.personalDetails?.lga            ?? '',
      ei?.personalDetails?.religion       ?? '',
      ei?.personalDetails?.address        ?? '',
      ei?.personalDetails?.homePhone      ?? '',
      ei?.personalDetails?.cellPhone      ?? '',
      ei?.personalDetails?.ninNumber      ?? '',
      dateStr(ei?.personalDetails?.birthDate),
      ei?.personalDetails?.maritalStatus  ?? '',
      ei?.personalDetails?.spouseName     ?? '',
      ei?.personalDetails?.spouseAddress  ?? '',
      ei?.personalDetails?.spousePhone    ?? '',
      ei?.personalDetails?.numberOfChildren ?? '',
      ei?.emergencyContact?.fullName      ?? '',
      ei?.emergencyContact?.address       ?? '',
      ei?.emergencyContact?.primaryPhone  ?? '',
      ei?.emergencyContact?.cellPhone     ?? '',
      ei?.emergencyContact?.relationship  ?? '',
      ei?.bankDetails?.bankName           ?? '',
      ei?.bankDetails?.accountName        ?? '',
      ei?.bankDetails?.accountNumber      ?? '',
      ei?.bankDetails?.bankSortCode       ?? '',
      yesNo(u.procurementRole?.canCreate),
      yesNo(u.procurementRole?.canView),
      yesNo(u.procurementRole?.canUpdate),
      yesNo(u.procurementRole?.canDelete),
      yesNo(u.financeRole?.canCreate),
      yesNo(u.financeRole?.canView),
      yesNo(u.financeRole?.canUpdate),
      yesNo(u.financeRole?.canDelete),
      dateStr(u.createdAt),
    ]);
  }

  // ── Column widths ─────────────────────────────────────────────────────────
  ws.columns.forEach((col, i) => {
    col.width = colWidth(HEADERS[i] ?? '');
  });

  // ── Borders on data area ──────────────────────────────────────────────────
  const headerRowNum = 5;
  for (let r = headerRowNum; r <= headerRowNum + users.length; r++) {
    ws.getRow(r).eachCell((cell) => {
      cell.border = {
        top:    { style: 'thin' },
        left:   { style: 'thin' },
        bottom: { style: 'thin' },
        right:  { style: 'thin' },
      };
    });
    ws.getRow(r).alignment = { vertical: 'top' };
  }

  // ── Stream to response ────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=casfod_staff_${Date.now()}.xlsx`);

  await wb.xlsx.write(res);
  res.end();
}
