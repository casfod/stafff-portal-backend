import { Response } from 'express';
import ExcelJS from 'exceljs';
import { Vendor } from '../models';

const HEADERS = [
  'Business Name', 'Business Type', 'Business Reg. Number', 'Business State',
  'Operating LGA', 'Categories', 'Contact Person', 'Business Phone',
  'Contact Phone', 'Email', 'Address',
  'Bank Name', 'Account Name', 'Account Number',
  'TIN Number', 'Vendor Code', 'Original Vendor Code',
  'Status', 'Approved By', 'Date Created',
] as const;

// ─── Style helpers ────────────────────────────────────────────────────────────
function colWidth(header: string): number {
  if (header.includes('Email') || header.includes('Address')) return 25;
  if (header === 'Business Name' || header.includes('Categories')) return 20;
  if (header.includes('Name') || header.includes('Person')) return 18;
  if (header.includes('Phone') || header.includes('Number') || header.includes('TIN')) return 16;
  if (header.includes('Code')) return 16;
  if (header.includes('Date')) return 12;
  return 14;
}

function dateStr(d: Date | undefined): string {
  return d ? new Date(d).toDateString() : '';
}

function approverName(v: any): string {
  const a = v.approvedBy;
  if (!a || typeof a !== 'object') return '';
  return `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim();
}

// ─── Status fill colors (matches the approval workflow states) ───────────────
const STATUS_FILL: Record<string, string> = {
  approved: 'FFDCFCE7', // light green
  pending:  'FFFEF9C3', // light yellow
  rejected: 'FFFEE2E2', // light red
  draft:    'FFF3F4F6', // light gray
  archived: 'FFE5E7EB', // gray
};

// ─── Main export ──────────────────────────────────────────────────────────────
export async function generateVendorsExcelReport(res: Response): Promise<void> {
  const vendors = await Vendor.find({})
    .populate('approvedBy', 'firstName lastName')
    .sort({ createdAt: -1 })
    .lean();

  const wb      = new ExcelJS.Workbook();
  const ws      = wb.addWorksheet('Vendors');
  const cols    = HEADERS.length;
  const lastCol = String.fromCharCode(64 + cols);

  // ── Title block ──────────────────────────────────────────────────────────
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getRow(1).getCell(1).value = 'CASFOD Vendor List';
  ws.getRow(1).font              = { bold: true, size: 16 };
  ws.getRow(1).alignment         = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height            = 25;

  ws.mergeCells(`A2:${lastCol}2`);
  ws.getRow(2).getCell(1).value = `REPORT DATE: ${new Date().toDateString()}`;
  ws.getRow(2).font              = { bold: true };

  ws.mergeCells(`A3:${lastCol}3`);
  ws.getRow(3).getCell(1).value = `TOTAL VENDORS: ${vendors.length}`;
  ws.getRow(3).font              = { bold: true };

  ws.addRow([]); // spacer

  // ── Header row ────────────────────────────────────────────────────────────
  const headerRow = ws.addRow(HEADERS as unknown as any[]);
  headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2F75B5' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'middle' };

  // ── Data rows ─────────────────────────────────────────────────────────────
  const statusColIndex = HEADERS.indexOf('Status') + 1;

  for (const v of vendors as any[]) {
    const row = ws.addRow([
      v.businessName,
      v.businessType,
      v.businessRegNumber,
      v.businessState,
      v.operatingLga ?? '',
      Array.isArray(v.categories) ? v.categories.join(', ') : '',
      v.contactPerson,
      v.businessPhoneNumber,
      v.contactPhoneNumber,
      v.email,
      v.address,
      v.bankName,
      v.accountName,
      v.accountNumber,
      v.tinNumber,
      v.vendorCode,
      v.originalVendorCode ?? '',
      v.status,
      approverName(v),
      dateStr(v.createdAt),
    ]);

    const fill = STATUS_FILL[v.status as string];
    if (fill) {
      row.getCell(statusColIndex).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
    }
  }

  // ── Column widths ─────────────────────────────────────────────────────────
  ws.columns.forEach((col, i) => {
    col.width = colWidth(HEADERS[i] ?? '');
  });

  // ── Borders on data area ──────────────────────────────────────────────────
  const headerRowNum = 5;
  for (let r = headerRowNum; r <= headerRowNum + vendors.length; r++) {
    ws.getRow(r).eachCell((cell) => {
      cell.border = {
        top:    { style: 'thin' },
        left:   { style: 'thin' },
        bottom: { style: 'thin' },
        right:  { style: 'thin' },
      };
    });
    ws.getRow(r).alignment = { vertical: 'top', wrapText: true };
  }

  // ── Stream to response ────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=casfod_vendors_${Date.now()}.xlsx`);

  await wb.xlsx.write(res);
  res.end();
}