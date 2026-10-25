import { BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import { FullDiagnosticReport } from '../types/ipc';

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatReportDate(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

function formatAge(dobString: string | null | undefined): string {
  if (!dobString) return 'Age not recorded';
  try {
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return 'Age not recorded';
    const now = new Date();
    let years = now.getFullYear() - dob.getFullYear();
    let months = now.getMonth() - dob.getMonth();
    let days = now.getDate() - dob.getDate();
    if (days < 0) {
      months--;
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    if (years > 0) return `${years} Yrs`;
    if (months > 0) return `${months} Months`;
    return `${Math.max(1, days)} Days`;
  } catch {
    return 'Age not recorded';
  }
}

export class PdfService {
  /**
   * Builds clean, standalone HTML for the diagnostic laboratory report.
   * Matches clinical laboratory requirements:
   * - No tagline
   * - No "Referred by"
   * - No "Status"
   * - No H/L explanation note
   * - No signature lines
   * - Centered computer-generated disclaimer footer
   */
  public static generateReportHtml(reportData: FullDiagnosticReport): string {
    const hospital = reportData.hospital;
    const phones = [hospital?.phone_primary, hospital?.phone_secondary].filter(Boolean).join(' / ');
    const contactLine = [phones ? `Phone: ${phones}` : '', hospital?.email ? hospital.email : '']
      .filter(Boolean)
      .join('  |  ');

    const patient = reportData.patient;
    const visit = reportData.visit;
    const snapshot = reportData.snapshot;

    const testsHtml = reportData.tests
      .map((testEntry) => {
        const filledResults = testEntry.results.filter(
          (pr) => pr.result && pr.result.result_value != null && pr.result.result_value.trim() !== ''
        );

        if (filledResults.length === 0) return '';

        const rowsHtml = filledResults
          .map((pr) => {
            const flag = pr.flag;
            const isCritical = flag === 'critical';
            const isHigh = flag === 'high';
            const isLow = flag === 'low';
            const abnormal = isCritical || isHigh || isLow;

            let flagBadge = '';
            if (isCritical) {
              flagBadge = '<span class="badge-critical">Critical</span>';
            } else if (isHigh) {
              flagBadge = '<span class="badge-high">H</span>';
            } else if (isLow) {
              flagBadge = '<span class="badge-low">L</span>';
            }

            const valDisplay = `<span class="${abnormal ? 'val-abnormal' : 'val-normal'}">${escapeHtml(pr.result!.result_value)}</span>${flagBadge}`;

            return `
              <tr>
                <td class="param-name">${escapeHtml(pr.parameter.name)}</td>
                <td class="param-result">${valDisplay}</td>
                <td class="param-range">${escapeHtml(pr.referenceRangeDisplay || '—')}</td>
                <td class="param-unit">${escapeHtml(pr.parameter.unit || '')}</td>
              </tr>
            `;
          })
          .join('');

        return `
          <div class="test-block">
            <div class="test-header">
              <span class="test-title">${escapeHtml(testEntry.orderItem.test_name_snapshot)}</span>
              <span class="test-code">${escapeHtml(testEntry.orderItem.test_code_snapshot)}</span>
            </div>
            <table class="results-table">
              <thead>
                <tr>
                  <th style="width: 38%;">Test</th>
                  <th style="width: 22%;">Result</th>
                  <th style="width: 25%;">Reference range</th>
                  <th style="width: 15%;">Unit</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        `;
      })
      .filter(Boolean)
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Laboratory Report - ${escapeHtml(patient.patient_mrn)}</title>
  <style>
    @page {
      size: A4;
      margin: 12mm 15mm 15mm 15mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #000;
      background: #fff;
      font-size: 12px;
      line-height: 1.5;
      padding: 10px;
    }
    .letterhead {
      border-bottom: 2px solid #0F766E;
      padding-bottom: 12px;
      margin-bottom: 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }
    .logo-container {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 12px;
      display: flex;
      align-items: center;
    }
    .logo-img {
      max-height: 65px;
      max-width: 140px;
      object-fit: contain;
    }
    .letterhead-content {
      text-align: center;
      width: 100%;
    }
    .letterhead-content h1 {
      font-size: 24px;
      font-weight: 800;
      color: #0F172A;
      margin-bottom: 3px;
      letter-spacing: -0.3px;
    }
    .letterhead-content p {
      font-size: 11px;
      color: #475569;
      margin: 1px 0;
    }
    .patient-card {
      border: 1px solid #94A3B8;
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 16px;
      display: table;
      width: 100%;
    }
    .patient-col {
      display: table-cell;
      width: 50%;
      vertical-align: top;
    }
    .patient-col:first-child {
      padding-right: 12px;
      border-right: 1px solid #CBD5E1;
    }
    .patient-col:last-child {
      padding-left: 12px;
    }
    .info-row {
      display: table;
      width: 100%;
      margin: 2px 0;
      font-size: 11px;
    }
    .info-label {
      display: table-cell;
      width: 95px;
      color: #64748B;
    }
    .info-val {
      display: table-cell;
      color: #000;
      font-weight: 500;
    }
    .info-val-bold {
      display: table-cell;
      color: #000;
      font-weight: 700;
    }
    .test-block {
      margin-bottom: 18px;
      page-break-inside: avoid;
    }
    .test-header {
      border-bottom: 1px solid #000;
      padding-bottom: 3px;
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }
    .test-title {
      font-size: 13px;
      font-weight: 700;
      color: #000;
    }
    .test-code {
      font-size: 11px;
      color: #64748B;
    }
    .results-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
      font-size: 12px;
    }
    .results-table th {
      font-size: 11px;
      font-weight: 600;
      color: #334155;
      border-bottom: 1px solid #94A3B8;
      padding: 5px 6px;
      background: #FAFAFA;
    }
    .results-table td {
      padding: 5px 6px;
      border-bottom: 1px solid #E2E8F0;
    }
    .param-name {
      font-weight: 500;
      color: #0F172A;
    }
    .param-result {
      font-variant-numeric: tabular-nums;
    }
    .val-normal {
      font-weight: 500;
      color: #000;
    }
    .val-abnormal {
      font-weight: 700;
      color: #000;
    }
    .val-pending {
      color: #94A3B8;
      font-style: italic;
    }
    .badge-high, .badge-low {
      display: inline-block;
      margin-left: 6px;
      font-weight: 700;
      font-size: 11px;
      color: #000;
    }
    .badge-critical {
      display: inline-block;
      margin-left: 6px;
      font-size: 9px;
      font-weight: 800;
      text-transform: uppercase;
      border: 1px solid #000;
      padding: 0 3px;
      border-radius: 2px;
      color: #000;
    }
    .param-range {
      color: #334155;
    }
    .param-unit {
      color: #475569;
    }
    .footer {
      margin-top: 36px;
      padding-top: 14px;
      border-top: 1px solid #CBD5E1;
      text-align: center;
      page-break-inside: avoid;
    }
    .disclaimer {
      font-size: 11px;
      font-weight: 600;
      color: #334155;
    }
    .verification {
      font-size: 10px;
      color: #94A3B8;
      margin-top: 4px;
      font-family: monospace;
    }
  </style>
</head>
<body>
  <!-- Header / Letterhead with Hospital Logo (No Tagline) -->
  <div class="letterhead">
    ${hospital?.logo_url ? `<div class="logo-container"><img src="${hospital.logo_url}" class="logo-img" alt="Logo" /></div>` : ''}
    <div class="letterhead-content">
      <h1>${escapeHtml(hospital?.hospital_name || 'Diagnostic Laboratory')}</h1>
      ${hospital?.address ? `<p>${escapeHtml(hospital.address)}</p>` : ''}
      ${contactLine ? `<p>${escapeHtml(contactLine)}</p>` : ''}
    </div>
  </div>

  <!-- Patient and visit details (No Referred By, No Status) -->
  <div class="patient-card">
    <div class="patient-col">
      <div class="info-row">
        <span class="info-label">MR no.</span>
        <span class="info-val-bold">${escapeHtml(patient.patient_mrn)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Patient name</span>
        <span class="info-val-bold">${escapeHtml(patient.full_name)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Age / sex</span>
        <span class="info-val">${formatAge(patient.date_of_birth)} / ${escapeHtml(patient.gender)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Phone</span>
        <span class="info-val">${escapeHtml(patient.phone_number || '—')}</span>
      </div>
    </div>

    <div class="patient-col">
      <div class="info-row">
        <span class="info-label">Report no.</span>
        <span class="info-val">${escapeHtml(snapshot?.report_number || `VISIT-${visit.visit_number}`)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Visit no.</span>
        <span class="info-val">${escapeHtml(visit.visit_number)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Visit date</span>
        <span class="info-val">${formatReportDate(visit.order_date)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Printed on</span>
        <span class="info-val">${formatReportDate(new Date().toISOString())}</span>
      </div>
    </div>
  </div>

  <!-- Test results -->
  ${testsHtml}

  <!-- Footer with Computer Generated Disclaimer (No signatures, No H/L explanation) -->
  <div class="footer">
    <p class="disclaimer">This is a computer-generated report, therefore it does not require any signature.</p>
  </div>
</body>
</html>`;
  }

  /**
   * Generates a clean, standalone PDF of the diagnostic report.
   */
  public static async exportReportPdf(
    parentWindow: BrowserWindow,
    reportData: FullDiagnosticReport,
    defaultFileName: string = 'Lab_Report.pdf'
  ): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(parentWindow, {
        title: 'Save Diagnostic Laboratory Report (PDF)',
        defaultPath: defaultFileName,
        filters: [{ name: 'PDF Documents (*.pdf)', extensions: ['pdf'] }],
      });

      if (canceled || !filePath) {
        return { success: false, cancelled: true };
      }

      const html = this.generateReportHtml(reportData);

      // Create an off-screen window for crisp, isolated PDF printing
      const printWindow = new BrowserWindow({
        show: false,
        width: 800,
        height: 1100,
        webPreferences: {
          offscreen: true,
        },
      });

      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

      // Allow 250ms for layout and fonts to render
      await new Promise((resolve) => setTimeout(resolve, 250));

      const pdfBuffer = await printWindow.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          top: 0.3,
          bottom: 0.3,
          left: 0.3,
          right: 0.3,
        },
      });

      printWindow.destroy();

      // Write to local disk
      await fs.promises.writeFile(filePath, pdfBuffer);

      return {
        success: true,
        filePath,
      };
    } catch (err: any) {
      console.error('PDF generation error:', err);
      return {
        success: false,
        error: err?.message || 'Failed to generate PDF document.',
      };
    }
  }
}
