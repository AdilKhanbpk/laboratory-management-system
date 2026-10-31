import { BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import { FullDiagnosticReport, ReportTemplate, HospitalSettings } from '../types/ipc';
import { LabAsset } from '../database/repositories/asset-repository';
import { DoctorCommissionSummary, DoctorReferredVisitItem, DoctorPayoutItem, DoctorCommissionOverview } from '../database/repositories/doctor-commission-repository';
import { DEFAULT_REPORT_TEMPLATE } from '../database/repositories/template-repository';

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
    if (years > 0) return `${years} Yrs${months > 0 ? ` ${months} Mo` : ''}`;
    if (months > 0) return `${months} Months${days > 0 ? ` ${days} Days` : ''}`;
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
    const template = reportData.template || DEFAULT_REPORT_TEMPLATE;
    const header = template.header;
    const hospital = reportData.hospital;
    const patient = reportData.patient;
    const visit = reportData.visit;
    const snapshot = reportData.snapshot;

    const logoSrc = header.showLogo
      ? header.logoDataUrl || hospital?.logo_url || ''
      : '';
    const showBadge = header.showBadge !== false && Boolean(header.badgeText);
    const visibleCols = template.columns.filter((c) => c.visible);

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

            const rawRange = (pr.referenceRangeDisplay || '').trim();
            const hasNormalRange = Boolean(
              rawRange &&
              rawRange !== '—' &&
              rawRange !== '-' &&
              rawRange !== '--' &&
              rawRange.toLowerCase() !== 'reference range not configured' &&
              rawRange.toLowerCase() !== 'n/a' &&
              rawRange.toLowerCase() !== 'not configured' &&
              flag !== 'unconfigured'
            );

            let statusText = '—';
            let statusClass = 'none';
            if (hasNormalRange) {
              if (isCritical) {
                statusText = 'Critical';
                statusClass = 'critical';
              } else if (isHigh) {
                statusText = 'High';
                statusClass = 'high';
              } else if (isLow) {
                statusText = 'Low';
                statusClass = 'low';
              } else {
                statusText = 'Normal';
                statusClass = 'normal';
              }
            }

            const tds = visibleCols
              .map((col) => {
                if (col.key === 'testName') {
                  return `<td class="param-name">${escapeHtml(pr.parameter.name)}</td>`;
                }
                if (col.key === 'result') {
                  return `<td class="param-result ${abnormal ? 'val-abnormal' : 'val-normal'}">${escapeHtml(pr.result!.result_value)}</td>`;
                }
                if (col.key === 'unit') {
                  return `<td class="param-unit">${escapeHtml(pr.parameter.unit || '—')}</td>`;
                }
                if (col.key === 'normalRange') {
                  return `<td class="param-range">${escapeHtml(pr.referenceRangeDisplay || '—')}</td>`;
                }
                if (col.key === 'status') {
                  if (hasNormalRange) {
                    return `<td class="param-status status-${statusClass}">${statusText}</td>`;
                  }
                  return `<td class="param-status text-slate-400" style="color: #94a3b8;">—</td>`;
                }
                return `<td>—</td>`;
              })
              .join('');

            return `<tr>${tds}</tr>`;
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
                  ${visibleCols.map((c) => `<th style="background: ${header.accentColor || '#079b98'};">${escapeHtml(c.label)}</th>`).join('')}
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

    const patientGridHtml = template.style.showPatientBox !== false ? `
      <div class="section-box patient-box">
        <div class="section-title">PATIENT DETAILS</div>
        <div class="patient-grid">
          <span>Patient Name: <b>${escapeHtml(patient.full_name)}</b></span>
          <span>Age / Gender: <b>${formatAge(patient.date_of_birth)} / ${escapeHtml(patient.gender)}</b></span>
          <span>Date: <b>${formatReportDate(visit.order_date)}</b></span>
          <span>Report No.: <b>${escapeHtml(snapshot?.report_number || `REP-${visit.visit_number}`)}</b></span>
          <span>C/O No.: <b>${escapeHtml(patient.patient_mrn)}</b></span>
          <span>Phone: <b>—</b></span>
          <span>Referring Physician: <b>${escapeHtml(reportData.doctor?.full_name || header.supervisor || 'Dr. Saad Khan')}</b></span>
        </div>
      </div>
    ` : '';

    const observationsHtml = template.observations?.visible ? `
      <div class="section-box observations-box">
        <div class="section-title">${escapeHtml(template.observations.title || 'COMPUTER TEST RESULTS / OBSERVATIONS')}</div>
        <div class="observations-body">
          ${escapeHtml(template.observations.defaultText || 'Specimen processed on automated clinical pathology analyzers. All calibration and internal quality control values within acceptable limits. Test results to be clinically correlated with patient symptoms.')}
        </div>
      </div>
    ` : '';

    const footerHtml = template.footer?.visible !== false ? `
      <div class="report-footer" style="background: ${template.footer?.color || '#124779'};">
        <span>${escapeHtml(template.footer?.text || 'Thank you for trusting AL-SHIFA MEDICAL CENTER | Dr. Saad Khan')}</span>
        <span>${escapeHtml(template.footer?.rightText || 'AL-SHIFA | Dr. Saad Khan')}</span>
      </div>
    ` : '';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Laboratory Report - ${escapeHtml(patient.patient_mrn)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: ${template.style.fontFamily || 'Arial'}, -apple-system, sans-serif;
      font-size: ${template.style.fontSize || 10}pt;
      line-height: 1.35;
      color: #1e293b;
      background: #ffffff;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-sheet {
      box-sizing: border-box;
      min-height: calc(297mm - 16mm - 1mm);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }
    .report-main-content {
      flex: 1 0 auto;
    }
    .report-header {
      min-height: 90px;
      color: #ffffff;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 14px;
      page-break-inside: avoid;
      break-inside: avoid;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .logo-img {
      width: 70px;
      height: 70px;
      object-fit: contain;
      background: #ffffff;
      padding: 4px;
      border-radius: 4px;
      flex-shrink: 0;
    }
    .header-text {
      flex: 1;
    }
    .hospital-name {
      font-weight: 800;
      font-size: 22px;
      line-height: 1.2;
      color: #ffffff;
    }
    .report-title {
      font-weight: 800;
      font-size: 14px;
      letter-spacing: 0.5px;
      color: #a5f3fc;
      margin-top: 2px;
    }
    .supervisor-line {
      font-weight: 700;
      font-size: 13px;
      margin-top: 3px;
      color: #fde047;
    }
    .service-badge {
      background: #05a9a7;
      color: #ffffff;
      border-radius: 8px;
      padding: 8px 12px;
      font-weight: 700;
      font-size: 12px;
      text-align: center;
      min-width: 105px;
      line-height: 1.25;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .accent-line {
      height: 6px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .contact-line {
      font-size: 10.5px;
      padding: 6px 4px 8px;
      border-bottom: 1px solid #94a3b8;
      line-height: 1.45;
      color: #334155;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .section-box {
      margin-top: 10px;
      border: 1px solid #94a3b8;
    }
    .patient-box, .observations-box {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .results-section {
      page-break-inside: auto;
      break-inside: auto;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    .section-title {
      background: #d6edf3;
      padding: 4px 8px;
      color: #0f3e74;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      page-break-after: avoid;
      break-after: avoid;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .patient-grid {
      display: grid;
      grid-template-columns: 1.3fr 1fr 1fr;
      padding: 6px 8px;
      font-size: 10.5px;
    }
    .patient-grid span {
      padding: 3px 2px;
      border-bottom: 1px solid #f1f5f9;
    }
    .test-block {
      margin-top: 8px;
      page-break-inside: auto;
      break-inside: auto;
    }
    .test-header {
      border-bottom: 1px solid #0f766e;
      padding: 2px 4px;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      page-break-after: avoid;
      break-after: avoid;
    }
    .test-title {
      font-size: 12px;
      font-weight: 700;
      color: #0f172a;
    }
    .test-code {
      font-size: 10px;
      color: #64748b;
    }
    .results-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10.5px;
      page-break-inside: auto;
      break-inside: auto;
    }
    .results-table thead {
      display: table-header-group;
    }
    .results-table th {
      color: #ffffff;
      text-align: left;
      padding: 5px 6px;
      font-size: 10.5px;
      font-weight: 700;
      text-transform: uppercase;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .results-table td {
      border: 1px solid #cbd5e1;
      padding: 4px 6px;
      font-size: 10.5px;
    }
    .results-table tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .param-name {
      font-weight: 600;
      color: #0f172a;
    }
    .param-result {
      font-variant-numeric: tabular-nums;
    }
    .val-normal {
      font-weight: 500;
      color: #1e293b;
    }
    .val-abnormal {
      font-weight: 700;
      color: #000000;
    }
    .status-normal {
      font-weight: 700;
      color: #15803d;
    }
    .status-low {
      font-weight: 700;
      color: #1d4ed8;
    }
    .status-high {
      font-weight: 700;
      color: #c2410c;
    }
    .status-critical {
      font-weight: 800;
      color: #b91c1c;
      background: #fef2f2;
      border: 1px solid #fecaca;
      border-radius: 3px;
      padding: 1px 6px;
      display: inline-block;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .observations-body {
      padding: 8px 10px;
      font-size: 10.5px;
      color: #475467;
      min-height: 48px;
      white-space: pre-wrap;
    }
    .report-footer {
      margin-top: auto;
      flex-shrink: 0;
      min-height: 44px;
      color: #ffffff;
      padding: 10px 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10.5px;
      font-weight: 500;
      page-break-inside: avoid;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .report-footer span {
      max-width: 65%;
      overflow-wrap: anywhere;
    }
  </style>
</head>
<body>
  <div class="report-sheet">
    <div class="report-main-content">
      <!-- Header / Letterhead with 5 lines & Logo -->
      <div class="report-header" style="background: ${header.color || '#124779'};">
        ${logoSrc ? `<img src="${logoSrc}" class="logo-img" alt="Logo" />` : ''}
        <div class="header-text">
          <div class="hospital-name">${escapeHtml(header.hospitalName || hospital?.hospital_name || 'AL-SHIFA MEDICAL CENTER')}</div>
          <div class="report-title">${escapeHtml(header.reportTitle || 'LAB TEST REPORT')}</div>
          <div class="supervisor-line">Under Supervision of: ${escapeHtml(header.supervisor || 'Dr. Saad Khan')}</div>
        </div>
        ${showBadge ? `<div class="service-badge">${escapeHtml(header.badgeText || '24 Ghantay Service')}</div>` : ''}
      </div>
      <div class="accent-line" style="background: ${header.accentColor || '#079b98'};"></div>
      <div class="contact-line">
        <div style="font-weight: 600;">${escapeHtml(header.address || hospital?.address || '')}</div>
        <div>Phone: ${escapeHtml(header.phone || hospital?.phone_primary || '')} &nbsp;|&nbsp; Mob: ${escapeHtml(header.mobile || '')} &nbsp;|&nbsp; WhatsApp: ${escapeHtml(header.whatsapp || '')}</div>
      </div>

      <!-- Patient Details -->
      ${patientGridHtml}

      <!-- Test Results -->
      <div class="section-box results-section" style="margin-top: 10px;">
        <div class="section-title">LAB TEST RESULTS</div>
        <div style="padding: 6px 8px;">
          ${testsHtml}
        </div>
      </div>

      <!-- Observations -->
      ${observationsHtml}
    </div>

    <!-- Footer Banner Anchored At True Page Bottom -->
    ${footerHtml}
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
          top: 0,
          bottom: 0,
          left: 0,
          right: 0,
        },
        preferCSSPageSize: true,
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

  /**
   * Prints the diagnostic report directly to the printer using Electron's native print dialog
   * rendering the exact same HTML template as the PDF.
   */
  public static async printReport(
    reportData: FullDiagnosticReport
  ): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
    return new Promise(async (resolve) => {
      let printWindow: BrowserWindow | null = null;
      try {
        const html = this.generateReportHtml(reportData);

        printWindow = new BrowserWindow({
          show: false,
          width: 800,
          height: 1100,
          webPreferences: {
            offscreen: true,
          },
        });

        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

        // Allow 350ms for layout, web fonts, and images to render completely
        await new Promise((r) => setTimeout(r, 350));

        printWindow.webContents.print(
          {
            silent: false,
            printBackground: true,
            color: true,
          },
          (success, failureReason) => {
            if (printWindow && !printWindow.isDestroyed()) {
              printWindow.destroy();
            }
            if (!success) {
              if (failureReason === 'cancelled' || failureReason === 'Print job canceled') {
                resolve({ success: false, cancelled: true });
              } else {
                resolve({ success: false, error: failureReason || 'Print failed.' });
              }
            } else {
              resolve({ success: true });
            }
          }
        );
      } catch (err: any) {
        if (printWindow && !printWindow.isDestroyed()) {
          printWindow.destroy();
        }
        console.error('Print report error:', err);
        resolve({ success: false, error: err?.message || 'Failed to print report.' });
      }
    });
  }

  /**
   * Creates a sample diagnostic report populated with the given template design
   * for testing print and PDF generation in the template designer.
   */
  public static createSampleReport(
    template: ReportTemplate,
    hospital?: HospitalSettings | null
  ): FullDiagnosticReport {
    return {
      visit: {
        id: 1,
        visit_number: '2026-00042',
        patient_id: 1,
        referring_doctor_id: 1,
        order_date: new Date().toISOString(),
        status: 'completed',
        operator_id: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      patient: {
        id: 1,
        patient_mrn: 'PAT-2026-00042',
        full_name: 'Muhammad Ali',
        date_of_birth: '1994-05-15',
        gender: 'male',
        phone_number: '0300-1234567',
        address: null,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      doctor: {
        id: 1,
        full_name: template.header.supervisor || 'Dr. Saad Khan',
        specialization: 'Pathologist',
        phone_number: template.header.mobile || '0315-1996504',
        clinic_hospital_name: null,
        address: null,
        notes: null,
        commission_percentage: 0,
        is_active: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      hospital: hospital || {
        id: 1,
        hospital_name: template.header.hospitalName || 'AL-SHIFA MEDICAL CENTER',
        tagline: null,
        address: template.header.address || 'Peshawar Swabi Road, Mohalla Panch Paao, Kohat',
        phone_primary: template.header.phone || '0938-281507',
        phone_secondary: template.header.mobile || '0315-1996504',
        email: 'info@alshifalab.com',
        logo_relative_path: null,
        logo_url: template.header.logoDataUrl || undefined,
        currency_code: 'PKR',
        timezone: 'Asia/Karachi',
        inactivity_timeout_minutes: 15,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      tests: [
        {
          orderItem: {
            id: 1,
            visit_id: 1,
            test_id: 101,
            test_name_snapshot: 'Complete Blood Picture (CP)',
            test_code_snapshot: 'CBC',
            price_snapshot: 80000,
            quantity: 1,
            subtotal_amount: 80000,
            status: 'completed',
            created_at: new Date().toISOString(),
          },
          results: [
            {
              parameter: { id: 1, name: 'Hemoglobin (Hb)', unit: 'g/dL', type: 'numeric', displayOrder: 1 },
              result: { id: 1, order_item_id: 1, parameter_id: 1, numeric_value: 11.2, result_value: '11.2', unit_snapshot: 'g/dL', reference_range_display: '13.0 - 17.0 g/dL', flag: 'low', status: 'finalized', entered_by: 1, entered_at: new Date().toISOString(), version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
              flag: 'low',
              referenceRangeDisplay: '13.0 - 17.0 g/dL',
            },
            {
              parameter: { id: 2, name: 'Total Leukocyte Count (TLC)', unit: 'x10^9/L', type: 'numeric', displayOrder: 2 },
              result: { id: 2, order_item_id: 1, parameter_id: 2, numeric_value: 12.1, result_value: '12.1', unit_snapshot: 'x10^9/L', reference_range_display: '4.0 - 11.0 x10^9/L', flag: 'high', status: 'finalized', entered_by: 1, entered_at: new Date().toISOString(), version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
              flag: 'high',
              referenceRangeDisplay: '4.0 - 11.0 x10^9/L',
            },
            {
              parameter: { id: 3, name: 'Platelet Count', unit: 'x10^9/L', type: 'numeric', displayOrder: 3 },
              result: { id: 3, order_item_id: 1, parameter_id: 3, numeric_value: 18, result_value: '18', unit_snapshot: 'x10^9/L', reference_range_display: '150 - 400 x10^9/L', flag: 'critical', status: 'finalized', entered_by: 1, entered_at: new Date().toISOString(), version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
              flag: 'critical',
              referenceRangeDisplay: '150 - 400 x10^9/L',
            },
            {
              parameter: { id: 4, name: 'Blood Glucose (Fasting)', unit: 'mg/dL', type: 'numeric', displayOrder: 4 },
              result: { id: 4, order_item_id: 1, parameter_id: 4, numeric_value: 95, result_value: '95', unit_snapshot: 'mg/dL', reference_range_display: '70 - 100 mg/dL', flag: 'normal', status: 'finalized', entered_by: 1, entered_at: new Date().toISOString(), version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
              flag: 'normal',
              referenceRangeDisplay: '70 - 100 mg/dL',
            },
          ],
        },
      ],
      template,
    };
  }

  /**
   * Generates clean printable HTML for Laboratory Assets & Purchases report.
   */
  public static generateAssetsReportHtml(
    assets: LabAsset[],
    hospital: HospitalSettings,
    dateRangeText: string,
    summary: { totalCount: number; totalAmountPaisa: number; technicianAmountPaisa?: number; doctorAmountPaisa?: number }
  ): string {
    const totalPkr = (summary.totalAmountPaisa / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const techPkr = ((summary.technicianAmountPaisa || 0) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const docPkr = ((summary.doctorAmountPaisa || 0) / 100).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const rowsHtml = assets
      .map((a, idx) => {
        const itemPkr = (a.amount_paisa / 100).toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
        const isTech = a.purchased_by === 'technician';
        const purchaserLabel = isTech ? 'Technician' : 'Doctor';
        const purchaserColor = isTech ? '#0f766e' : '#2563eb';
        return `
          <tr style="background: ${idx % 2 === 0 ? '#ffffff' : '#f8fafc'}; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 7px 10px; font-size: 11px; white-space: nowrap;">${escapeHtml(a.purchase_date)}</td>
            <td style="padding: 7px 10px; font-size: 11px; font-weight: 600; color: #1e293b;">${escapeHtml(a.title)}</td>
            <td style="padding: 7px 10px; font-size: 11px; white-space: nowrap;">
              <span style="font-weight: 600; color: ${purchaserColor};">${purchaserLabel}</span>
              ${a.purchaser_name ? `<br><span style="font-size: 10px; color: #64748b;">${escapeHtml(a.purchaser_name)}</span>` : ''}
            </td>
            <td style="padding: 7px 10px; font-size: 11px; text-transform: capitalize; color: #475569;">${escapeHtml(a.category || 'General')}</td>
            <td style="padding: 7px 10px; font-size: 11px; color: #475569;">${escapeHtml(a.vendor_name || '—')}</td>
            <td style="padding: 7px 10px; font-size: 11px; color: #475569;">${escapeHtml(a.invoice_receipt_no || '—')}</td>
            <td style="padding: 7px 10px; font-size: 10px; color: #64748b; max-width: 140px; overflow-wrap: anywhere;">${escapeHtml(a.notes || '—')}</td>
            <td style="padding: 7px 10px; font-size: 11px; font-weight: 700; text-align: right; color: #0f766e; white-space: nowrap;">PKR ${itemPkr}</td>
          </tr>
        `;
      })
      .join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Assets and Purchases Report</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, -apple-system, sans-serif;
      color: #1e293b;
      background: #ffffff;
      padding: 12px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      border-bottom: 2px solid #0f766e;
      padding-bottom: 12px;
      margin-bottom: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .lab-name {
      font-size: 18px;
      font-weight: bold;
      color: #0f766e;
    }
    .lab-address {
      font-size: 11px;
      color: #475569;
      margin-top: 2px;
    }
    .report-meta {
      text-align: right;
    }
    .report-title {
      font-size: 16px;
      font-weight: bold;
      color: #0f172a;
    }
    .report-date {
      font-size: 11px;
      color: #64748b;
      margin-top: 2px;
    }
    .summary-bar {
      display: flex;
      gap: 16px;
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 16px;
    }
    .summary-item {
      display: flex;
      flex-direction: column;
    }
    .summary-label {
      font-size: 10px;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
    }
    .summary-val {
      font-size: 15px;
      font-weight: bold;
      color: #0f766e;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
    }
    th {
      background: #0f766e;
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
      text-align: left;
      padding: 8px 10px;
    }
    th.text-right {
      text-align: right;
    }
    .footer {
      margin-top: 24px;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
      display: flex;
      justify-content: space-between;
      font-size: 10px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="lab-name">${escapeHtml(hospital.hospital_name || 'Laboratory')}</div>
      <div class="lab-address">${escapeHtml(hospital.address || '')} ${hospital.phone_primary ? `• Tel: ${escapeHtml(hospital.phone_primary)}` : ''}</div>
    </div>
    <div class="report-meta">
      <div class="report-title">ASSETS & PURCHASES REPORT</div>
      <div class="report-date">Period: ${escapeHtml(dateRangeText)}</div>
    </div>
  </div>

  <div class="summary-bar">
    <div class="summary-item">
      <span class="summary-label">Total Entries</span>
      <span class="summary-val">${summary.totalCount} items</span>
    </div>
    <div class="summary-item">
      <span class="summary-label">Total Purchases / Expenses</span>
      <span class="summary-val">PKR ${totalPkr}</span>
    </div>
    ${(summary.technicianAmountPaisa || 0) > 0 ? `
    <div class="summary-item">
      <span class="summary-label">Technician Out-of-Pocket</span>
      <span class="summary-val" style="color: #0f766e;">PKR ${techPkr}</span>
    </div>` : ''}
    ${(summary.doctorAmountPaisa || 0) > 0 ? `
    <div class="summary-item">
      <span class="summary-label">Doctor / Lab Purchases</span>
      <span class="summary-val" style="color: #2563eb;">PKR ${docPkr}</span>
    </div>` : ''}
    <div class="summary-item">
      <span class="summary-label">Printed Date</span>
      <span class="summary-val" style="font-size: 12px; color: #475569; margin-top: 3px;">${new Date().toLocaleDateString()}</span>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 85px;">Date</th>
        <th>Asset / Item Title</th>
        <th style="width: 100px;">Purchased By</th>
        <th style="width: 90px;">Category</th>
        <th style="width: 100px;">Vendor</th>
        <th style="width: 80px;">Receipt #</th>
        <th>Notes</th>
        <th class="text-right" style="width: 110px;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
    <tfoot>
      <tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid #0f766e;">
        <td colspan="7" style="padding: 10px; text-align: right; font-size: 12px;">Total Purchases:</td>
        <td style="padding: 10px; text-align: right; font-size: 13px; color: #0f766e; white-space: nowrap;">PKR ${totalPkr}</td>
      </tr>
    </tfoot>
  </table>

  <div class="footer">
    <span>Offline Laboratory Management System • Confidential Financial Record</span>
    <span>Page 1 of 1</span>
  </div>
</body>
</html>`;
  }

  /**
   * Exports the assets & purchases list to a standalone PDF report file.
   */
  public static async exportAssetsReportPdf(
    assets: LabAsset[],
    hospital: HospitalSettings,
    dateRangeText: string,
    summary: { totalCount: number; totalAmountPaisa: number; technicianAmountPaisa?: number; doctorAmountPaisa?: number },
    mainWindow?: BrowserWindow | null
  ): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> {
    try {
      const now = new Date().toISOString().split('T')[0];
      const defaultFilename = `Assets_Purchases_Report_${now}.pdf`;

      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow || (undefined as any), {
        title: 'Save Assets & Purchases PDF Report',
        defaultPath: defaultFilename,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      });

      if (canceled || !filePath) {
        return { success: false, cancelled: true };
      }

      const html = this.generateAssetsReportHtml(assets, hospital, dateRangeText, summary);

      const printWindow = new BrowserWindow({
        show: false,
        width: 800,
        height: 1100,
        webPreferences: {
          offscreen: true,
        },
      });

      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((resolve) => setTimeout(resolve, 300));

      const pdfBuffer = await printWindow.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        preferCSSPageSize: true,
      });

      printWindow.destroy();

      await fs.promises.writeFile(filePath, pdfBuffer);

      return { success: true, filePath };
    } catch (err: any) {
      console.error('Assets report PDF error:', err);
      return { success: false, error: err?.message || 'Failed to export assets report PDF.' };
    }
  }

  /**
   * Generates clean HTML for Laboratory Partnership Statement.
   */
  public static generatePartnershipStatementHtml(
    data: any,
    hospital: HospitalSettings,
    dateRangeText: string
  ): string {
    const fmt = (paisa?: number) => {
      const val = (paisa || 0) / 100;
      return `Rs. ${val.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    };

    const p = data.period || {};
    const techBal = p.remainingBalancePaisa || 0;
    const invBal = p.investorRemainingBalancePaisa || 0;
    const statusNote =
      techBal > 0
        ? `Investor owes Technician ${fmt(techBal)}`
        : techBal < 0
        ? `Technician balance is ahead by ${fmt(Math.abs(techBal))}`
        : 'All partner accounts are fully settled';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Partnership Settlement Statement</title>
  <style>
    @page { size: A4; margin: 15mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; font-size: 13px; line-height: 1.5; margin: 0; padding: 0; }
    .header { border-bottom: 2px solid #0f766e; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 20px; font-weight: bold; color: #0f766e; margin: 0 0 4px 0; }
    .subtitle { font-size: 13px; color: #64748b; margin: 0; }
    .period-badge { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 4px 10px; border-radius: 6px; font-weight: 600; font-size: 12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
    .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; }
    .card-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: bold; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 13px; }
    th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 8px 12px; border: 1px solid #cbd5e1; }
    td { padding: 8px 12px; border: 1px solid #cbd5e1; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row { background: #f8fafc; font-weight: bold; }
    .highlight-row { background: #f0fdfa; font-weight: bold; color: #0f766e; }
    .banner { background: #f8fafc; border: 2px dashed #0f766e; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px; text-align: center; font-size: 15px; font-weight: bold; color: #0f766e; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 50px; }
    .sig-line { border-top: 1px solid #94a3b8; padding-top: 8px; text-align: center; font-size: 12px; color: #475569; font-weight: 500; }
    .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="title">${escapeHtml(hospital.hospital_name || 'Laboratory')}</h1>
      <p class="subtitle">${escapeHtml(hospital.address || '')} ${hospital.phone_primary ? `· Tel: ${escapeHtml(hospital.phone_primary)}` : ''}</p>
      <p class="subtitle" style="margin-top: 4px; font-weight: 600; color: #334155;">PARTNERSHIP PROFIT &amp; SETTLEMENT STATEMENT</p>
    </div>
    <div style="text-align: right;">
      <span class="period-badge">${escapeHtml(dateRangeText)}</span>
      <p class="subtitle" style="margin-top: 6px;">Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}</p>
    </div>
  </div>

  <div class="banner">
    ${escapeHtml(statusNote)}
  </div>

  <h3 style="font-size: 14px; margin-bottom: 8px; color: #0f766e;">1. Laboratory Profit &amp; Loss Calculation</h3>
  <table>
    <thead>
      <tr>
        <th>Accounting Item</th>
        <th class="num">Amount (PKR)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Gross Sales / Patient Bills Issued</td>
        <td class="num">${fmt(p.totalSalesPaisa)}</td>
      </tr>
      <tr>
        <td>Less: Referring Doctors Commissions</td>
        <td class="num" style="color: #dc2626;">- ${fmt(p.totalDoctorsCommissionPaisa)}</td>
      </tr>
      <tr>
        <td>Less: Laboratory Expenses &amp; Purchases</td>
        <td class="num" style="color: #dc2626;">- ${fmt(p.totalAssetsPaisa)}</td>
      </tr>
      <tr class="highlight-row">
        <td>= Net Distributable Profit</td>
        <td class="num" style="font-size: 14px;">${fmt(p.netProfitPaisa)}</td>
      </tr>
    </tbody>
  </table>

  <h3 style="font-size: 14px; margin-bottom: 8px; color: #0f766e;">2. Partner Profit Split &amp; Settlement</h3>
  <table>
    <thead>
      <tr>
        <th>Partner</th>
        <th style="text-align: center;">Share %</th>
        <th class="num">Calculated Share</th>
        <th class="num">Paid / Withdrawn</th>
        <th class="num">Outstanding Balance</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Technician</strong></td>
        <td style="text-align: center;">${p.technicianPct || 50}%</td>
        <td class="num">${fmt(p.mySharePaisa)}</td>
        <td class="num">${fmt(p.totalReceivedPaisa)}</td>
        <td class="num" style="font-weight: bold; color: ${techBal > 0 ? '#0f766e' : '#1e293b'};">${fmt(techBal)}</td>
      </tr>
      <tr>
        <td><strong>Investor</strong></td>
        <td style="text-align: center;">${p.investorPct || 50}%</td>
        <td class="num">${fmt(p.investorSharePaisa)}</td>
        <td class="num">${fmt(p.investorPaidPaisa)}</td>
        <td class="num" style="font-weight: bold;">${fmt(invBal)}</td>
      </tr>
    </tbody>
  </table>

  <h3 style="font-size: 14px; margin-bottom: 8px; color: #0f766e;">3. Cash &amp; Collection Summary</h3>
  <table>
    <thead>
      <tr>
        <th>Billed Amount</th>
        <th class="num">Collected Cash</th>
        <th class="num">Unpaid Bills</th>
        <th class="num">Transferred to Technician</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${fmt(p.totalSalesPaisa)}</td>
        <td class="num" style="color: #166534; font-weight: 600;">${fmt(p.totalCollectedPaisa)}</td>
        <td class="num" style="color: #dc2626;">${fmt(p.unpaidPatientBillsPaisa)}</td>
        <td class="num">${fmt(p.totalReceivedPaisa)}</td>
      </tr>
    </tbody>
  </table>

  <div class="signatures">
    <div>
      <div class="sig-line">Laboratory Technician Signature &amp; Date</div>
    </div>
    <div>
      <div class="sig-line">Investor / Partner Signature &amp; Date</div>
    </div>
  </div>

  <div class="footer">
    <span>${escapeHtml(hospital.hospital_name || 'Laboratory Management System')} · Confidential Partnership Document</span>
    <span>Page 1 of 1</span>
  </div>
</body>
</html>`;
  }

  /**
   * Exports the Partnership Statement to a standalone PDF.
   */
  public static async exportPartnershipStatementPdf(
    data: any,
    hospital: HospitalSettings,
    dateRangeText: string,
    mainWindow?: BrowserWindow | null
  ): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> {
    try {
      const now = new Date().toISOString().split('T')[0];
      const defaultFilename = `Partnership_Statement_${now}.pdf`;

      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow || (undefined as any), {
        title: 'Save Partnership Settlement Statement PDF',
        defaultPath: defaultFilename,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      });

      if (canceled || !filePath) {
        return { success: false, cancelled: true };
      }

      const html = this.generatePartnershipStatementHtml(data, hospital, dateRangeText);

      const printWindow = new BrowserWindow({
        show: false,
        width: 800,
        height: 1100,
        webPreferences: {
          offscreen: true,
        },
      });

      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((resolve) => setTimeout(resolve, 300));

      const pdfBuffer = await printWindow.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        preferCSSPageSize: true,
      });

      printWindow.destroy();

      await fs.promises.writeFile(filePath, pdfBuffer);

      return { success: true, filePath };
    } catch (err: any) {
      console.error('Partnership statement PDF error:', err);
      return { success: false, error: err?.message || 'Failed to export statement PDF.' };
    }
  }

  /**
   * Generates clean, professional HTML for Doctor Commission & Settlement Statement.
   */
  public static generateDoctorCommissionStatementHtml(
    summary: DoctorCommissionSummary,
    visits: DoctorReferredVisitItem[],
    payouts: DoctorPayoutItem[],
    hospital: HospitalSettings,
    dateRangeText: string
  ): string {
    const fmt = (paisa?: number) => {
      const val = (paisa || 0) / 100;
      return `Rs. ${val.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    };

    const logoHtml = hospital.logo_url
      ? `<img src="${hospital.logo_url}" alt="Hospital Logo" style="max-height: 60px; max-width: 160px; object-fit: contain;" />`
      : '';

    const remainingBal = summary.remainingBalancePaisa;
    const balanceColor = remainingBal > 0 ? '#b45309' : remainingBal < 0 ? '#047857' : '#1e293b';
    const balanceBg = remainingBal > 0 ? '#fffbeb' : remainingBal < 0 ? '#ecfdf5' : '#f8fafc';
    const balanceBorder = remainingBal > 0 ? '#fde68a' : remainingBal < 0 ? '#a7f3d0' : '#e2e8f0';

    const visitsRows = visits.length === 0
      ? `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 16px;">No patient visits recorded in this period.</td></tr>`
      : visits.map((v) => `
        <tr>
          <td>${v.orderDate ? v.orderDate.slice(0, 10) : '—'}</td>
          <td><strong>${escapeHtml(v.visitNumber)}</strong></td>
          <td>
            <div style="font-weight: 600;">${escapeHtml(v.patientName)}</div>
            <div style="font-size: 11px; color: #64748b;">${escapeHtml(v.patientMrn)} · ${escapeHtml(v.patientGender)}</div>
          </td>
          <td style="font-size: 11px; color: #334155;">${escapeHtml(v.testNames || '—')}</td>
          <td class="num">${fmt(v.netTotalPaisa)}</td>
          <td class="num" style="color: #64748b;">${v.doctorPercentage}%</td>
          <td class="num" style="font-weight: 600; color: #0f766e;">${fmt(v.commissionPaisa)}</td>
        </tr>
      `).join('');

    const payoutsRows = payouts.length === 0
      ? `<tr><td colspan="5" style="text-align: center; color: #64748b; padding: 12px;">No payment settlements recorded in this period.</td></tr>`
      : payouts.map((p) => `
        <tr>
          <td>${p.paymentDate}</td>
          <td style="font-weight: bold; color: #047857;" class="num">${fmt(p.amountPaisa)}</td>
          <td style="text-transform: capitalize;">${escapeHtml(p.paymentMethod)}</td>
          <td>${escapeHtml(p.reference || '—')}</td>
          <td style="font-size: 11px; color: #64748b;">${escapeHtml(p.recordedByName ? `By ${p.recordedByName}` : '')}${p.notes ? ` · ${escapeHtml(p.notes)}` : ''}</td>
        </tr>
      `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Doctor Commission Statement - ${escapeHtml(summary.doctorName)}</title>
  <style>
    @page { size: A4; margin: 12mm 14mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; color: #1e293b; font-size: 12px; line-height: 1.45; margin: 0; padding: 0; }
    .header { border-bottom: 2px solid #0f766e; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
    .title { font-size: 18px; font-weight: bold; color: #0f766e; margin: 0 0 3px 0; text-transform: uppercase; letter-spacing: 0.03em; }
    .subtitle { font-size: 12px; color: #64748b; margin: 0; }
    .hospital-name { font-size: 15px; font-weight: 700; color: #0f766e; }
    .hospital-meta { font-size: 11px; color: #64748b; margin-top: 2px; }
    
    .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: center; }
    .doc-info { font-size: 13px; font-weight: 700; color: #0f766e; }
    .doc-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
    .period-pill { background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; }

    .kpi-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 16px; }
    .kpi-card { background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; text-align: center; }
    .kpi-title { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; font-weight: 700; }
    .kpi-value { font-size: 14px; font-weight: 700; margin-top: 3px; font-variant-numeric: tabular-nums; }
    .kpi-sub { font-size: 10px; color: #94a3b8; margin-top: 2px; }

    .balance-banner { border-radius: 6px; padding: 10px 16px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center; }
    .balance-label { font-size: 13px; font-weight: 700; }
    .balance-amount { font-size: 18px; font-weight: 800; font-variant-numeric: tabular-nums; }

    .sec-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #0f766e; margin: 14px 0 6px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; display: flex; justify-content: space-between; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 11px; }
    th { background: #f1f5f9; color: #475569; font-weight: 600; text-align: left; padding: 6px 8px; border: 1px solid #cbd5e1; }
    td { padding: 6px 8px; border: 1px solid #cbd5e1; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .tfoot-row { background: #f8fafc; font-weight: 700; }

    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 35px; }
    .sig-line { border-top: 1px solid #94a3b8; padding-top: 6px; text-align: center; font-size: 11px; color: #475569; font-weight: 600; }
    .footer { margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px; font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="hospital-name">${escapeHtml(hospital.hospital_name || 'CLINICAL LABORATORY')}</div>
      <div class="hospital-meta">${escapeHtml(hospital.address || '')}${hospital.phone_primary ? ` · Ph: ${escapeHtml(hospital.phone_primary)}` : ''}</div>
    </div>
    <div style="text-align: right;">
      ${logoHtml}
    </div>
  </div>

  <div class="meta-box">
    <div>
      <div class="doc-info">${escapeHtml(summary.doctorName)} (${summary.commissionPercentage}% Commission)</div>
      <div class="doc-sub">${escapeHtml(summary.specialization || 'Consultant Physician')}${summary.clinicHospitalName ? ` · ${escapeHtml(summary.clinicHospitalName)}` : ''}${summary.phoneNumber ? ` · ${escapeHtml(summary.phoneNumber)}` : ''}</div>
    </div>
    <div style="text-align: right;">
      <div class="title" style="font-size: 14px;">Commission Statement</div>
      <div class="period-pill">${escapeHtml(dateRangeText)}</div>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-title">Referred Visits</div>
      <div class="kpi-value" style="color: #0f766e;">${summary.totalReferredVisits}</div>
      <div class="kpi-sub">${summary.totalTestsOrdered} tests ordered</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Gross Patient Bill</div>
      <div class="kpi-value">${fmt(summary.netRevenuePaisa)}</div>
      <div class="kpi-sub">Total: ${fmt(summary.grossRevenuePaisa)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Doctor Commission Share</div>
      <div class="kpi-value" style="color: #0f766e;">${fmt(summary.totalEarnedCommissionPaisa)}</div>
      <div class="kpi-sub">At ${summary.commissionPercentage}% rate</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Total Paid</div>
      <div class="kpi-value" style="color: #047857;">${fmt(summary.totalPaidPaisa)}</div>
      <div class="kpi-sub">${payouts.length} disbursements</div>
    </div>
    <div class="kpi-card" style="border-color: ${balanceBorder}; background: ${balanceBg};">
      <div class="kpi-title" style="color: ${balanceColor};">Net Balance Due</div>
      <div class="kpi-value" style="color: ${balanceColor};">${fmt(summary.remainingBalancePaisa)}</div>
      <div class="kpi-sub" style="color: ${balanceColor};">${remainingBal > 0 ? 'Payable' : 'Settled'}</div>
    </div>
  </div>

  <div class="balance-banner" style="background: ${balanceBg}; border: 1.5px solid ${balanceBorder}; color: ${balanceColor};">
    <div class="balance-label">
      ${remainingBal > 0
        ? `Outstanding Commission Balance Payable to ${escapeHtml(summary.doctorName)}:`
        : remainingBal < 0
        ? `Doctor Commission Account has Advance Balance:`
        : `Doctor Commission Account is Fully Settled:`}
    </div>
    <div class="balance-amount">${fmt(Math.abs(remainingBal))}</div>
  </div>

  <div class="sec-title">
    <span>1. Referred Patient Visits & Commission Breakdown</span>
    <span style="font-weight: normal; font-size: 11px;">Total Visits: ${visits.length}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 12%;">Date</th>
        <th style="width: 14%;">Visit #</th>
        <th style="width: 25%;">Patient Name & MRN</th>
        <th style="width: 23%;">Tests Ordered</th>
        <th style="width: 10%;" class="num">Net Bill</th>
        <th style="width: 6%;" class="num">Rate</th>
        <th style="width: 10%;" class="num">Doctor Share</th>
      </tr>
    </thead>
    <tbody>
      ${visitsRows}
    </tbody>
    ${visits.length > 0 ? `
    <tfoot>
      <tr class="tfoot-row">
        <td colspan="4">Subtotal (${visits.length} visits)</td>
        <td class="num">${fmt(summary.netRevenuePaisa)}</td>
        <td></td>
        <td class="num" style="color: #0f766e;">${fmt(summary.totalEarnedCommissionPaisa)}</td>
      </tr>
    </tfoot>
    ` : ''}
  </table>

  <div class="sec-title">
    <span>2. Settlement Payments & Disbursements Ledger</span>
    <span style="font-weight: normal; font-size: 11px;">Total Paid: ${fmt(summary.totalPaidPaisa)}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th style="width: 16%;">Payment Date</th>
        <th style="width: 18%;" class="num">Amount Paid</th>
        <th style="width: 18%;">Payment Method</th>
        <th style="width: 20%;">Receipt / Ref #</th>
        <th style="width: 28%;">Recorded By & Notes</th>
      </tr>
    </thead>
    <tbody>
      ${payoutsRows}
    </tbody>
    ${payouts.length > 0 ? `
    <tfoot>
      <tr class="tfoot-row">
        <td>Total Paid</td>
        <td class="num" style="color: #047857;">${fmt(summary.totalPaidPaisa)}</td>
        <td colspan="3"></td>
      </tr>
    </tfoot>
    ` : ''}
  </table>

  <div class="signatures">
    <div class="sig-line">Prepared By (Laboratory Accountant / Manager)</div>
    <div class="sig-line">Doctor Acknowledgment Signature</div>
  </div>

  <div class="footer">
    <span>Generated by Clinical Laboratory Management System on ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</span>
    <span>Official Financial Statement</span>
  </div>
</body>
</html>`;
  }

  /**
   * Exports Doctor Commission Statement to an A4 PDF document.
   */
  public static async exportDoctorCommissionStatementPdf(
    summary: DoctorCommissionSummary,
    visits: DoctorReferredVisitItem[],
    payouts: DoctorPayoutItem[],
    hospital: HospitalSettings,
    dateRangeText: string,
    mainWindow?: BrowserWindow | null
  ): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> {
    try {
      const now = new Date().toISOString().split('T')[0];
      const sanitizedName = summary.doctorName.replace(/[^a-zA-Z0-9_-]/g, '_');
      const defaultFilename = `Doctor_Statement_${sanitizedName}_${now}.pdf`;

      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow || (undefined as any), {
        title: `Save Commission Statement for ${summary.doctorName}`,
        defaultPath: defaultFilename,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      });

      if (canceled || !filePath) {
        return { success: false, cancelled: true };
      }

      const html = this.generateDoctorCommissionStatementHtml(summary, visits, payouts, hospital, dateRangeText);

      const printWindow = new BrowserWindow({
        show: false,
        width: 800,
        height: 1100,
        webPreferences: {
          offscreen: true,
        },
      });

      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((resolve) => setTimeout(resolve, 300));

      const pdfBuffer = await printWindow.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        preferCSSPageSize: true,
      });

      printWindow.destroy();

      await fs.promises.writeFile(filePath, pdfBuffer);

      return { success: true, filePath };
    } catch (err: any) {
      console.error('Doctor statement PDF export error:', err);
      return { success: false, error: err?.message || 'Failed to export doctor statement PDF.' };
    }
  }

  /**
   * Prints Doctor Commission Statement directly using native print dialog.
   */
  public static async printDoctorCommissionStatement(
    summary: DoctorCommissionSummary,
    visits: DoctorReferredVisitItem[],
    payouts: DoctorPayoutItem[],
    hospital: HospitalSettings,
    dateRangeText: string
  ): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
    return new Promise(async (resolve) => {
      let printWindow: BrowserWindow | null = null;
      try {
        const html = this.generateDoctorCommissionStatementHtml(summary, visits, payouts, hospital, dateRangeText);

        printWindow = new BrowserWindow({
          show: false,
          width: 800,
          height: 1100,
          webPreferences: {
            offscreen: true,
          },
        });

        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        await new Promise((r) => setTimeout(r, 350));

        printWindow.webContents.print(
          {
            silent: false,
            printBackground: true,
            color: true,
          },
          (success, failureReason) => {
            if (printWindow && !printWindow.isDestroyed()) {
              printWindow.destroy();
            }
            if (!success) {
              if (failureReason === 'cancelled' || failureReason === 'Print job canceled') {
                resolve({ success: false, cancelled: true });
              } else {
                resolve({ success: false, error: failureReason || 'Print failed.' });
              }
            } else {
              resolve({ success: true });
            }
          }
        );
      } catch (err: any) {
        if (printWindow && !printWindow.isDestroyed()) {
          printWindow.destroy();
        }
        console.error('Print doctor statement error:', err);
        resolve({ success: false, error: err?.message || 'Failed to print doctor statement.' });
      }
    });
  }

  /**
   * Generates HTML statement for All Referring Doctors Commission Overview.
   */
  public static generateAllDoctorsCommissionOverviewHtml(
    overview: DoctorCommissionOverview,
    payouts: DoctorPayoutItem[],
    hospital: HospitalSettings,
    dateRangeText: string
  ): string {
    const fmt = (paisa?: number | null) => {
      const val = (paisa || 0) / 100;
      return `Rs. ${val.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    };

    const ov = overview.overall;
    const balanceColor = ov.remainingBalancePaisa > 0 ? '#b91c1c' : '#047857';

    const doctorRows = overview.doctors.map((d, idx) => `
      <tr>
        <td style="text-align: center; color: #64748b;">${idx + 1}</td>
        <td>
          <strong>${escapeHtml(d.doctorName)}</strong>
          ${d.specialization ? `<div style="font-size: 10px; color: #64748b;">${escapeHtml(d.specialization)}</div>` : ''}
        </td>
        <td class="num"><span style="display: inline-block; padding: 1px 5px; border-radius: 4px; background: #f0fdfa; border: 1px solid #ccfbf1; font-weight: 600; color: #0f766e;">${d.commissionPercentage}%</span></td>
        <td class="num">${d.referredVisits}</td>
        <td class="num">${fmt(d.netSalesPaisa)}</td>
        <td class="num" style="color: #0f766e; font-weight: 600;">${fmt(d.commissionPaisa)}</td>
        <td class="num">${fmt(d.paidPaisa)}</td>
        <td class="num" style="font-weight: 600; color: ${d.balancePaisa > 0 ? '#b91c1c' : '#047857'};">
          ${d.balancePaisa > 0 ? fmt(d.balancePaisa) : 'Settled'}
        </td>
      </tr>
    `).join('');

    const recentPayoutRows = payouts.slice(0, 15).map((p) => `
      <tr>
        <td>${p.paymentDate.slice(0, 10)}</td>
        <td><strong>${escapeHtml(p.doctorName || `Doctor #${p.doctorId}`)}</strong></td>
        <td class="num" style="font-weight: 600;">${fmt(p.amountPaisa)}</td>
        <td style="text-transform: capitalize;">${escapeHtml(p.paymentMethod.replace('_', ' '))}</td>
        <td>${escapeHtml(p.reference || '—')}</td>
        <td style="color: #64748b;">${escapeHtml(p.recordedByName || 'System')}</td>
      </tr>
    `).join('');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Doctors Commission Overview</title>
  <style>
    @page { size: A4 portrait; margin: 12mm 12mm 12mm 12mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11px; line-height: 1.4; color: #1e293b; margin: 0; padding: 0; }
    .header-table { width: 100%; border-bottom: 2px solid #0f766e; padding-bottom: 8px; margin-bottom: 12px; }
    .lab-title { font-size: 18px; font-weight: 800; color: #0f766e; margin: 0 0 3px 0; }
    .lab-sub { font-size: 10px; color: #64748b; }
    .doc-badge { text-align: right; }
    .doc-title { font-size: 14px; font-weight: 700; color: #0f172a; margin-bottom: 3px; }
    .kpi-grid { display: flex; gap: 8px; margin-bottom: 14px; }
    .kpi-card { flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; background: #f8fafc; }
    .kpi-title { font-size: 9px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; color: #64748b; margin-bottom: 3px; }
    .kpi-value { font-size: 14px; font-weight: 800; color: #0f172a; }
    .kpi-sub { font-size: 9px; color: #64748b; margin-top: 1px; }
    .sec-title { font-size: 12px; font-weight: 700; color: #0f766e; margin: 12px 0 6px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 3px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 12px; }
    th { background: #f1f5f9; color: #334155; font-weight: 700; text-align: left; padding: 5px 6px; border: 1px solid #cbd5e1; }
    td { padding: 4px 6px; border: 1px solid #e2e8f0; vertical-align: top; }
    .num { text-align: right; }
    .tfoot-row td { font-weight: 700; background: #f8fafc; border-top: 2px solid #cbd5e1; }
    .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid #e2e8f0; font-size: 9px; color: #64748b; display: flex; justify-content: space-between; }
  </style>
</head>
<body>
  <table class="header-table">
    <tr>
      <td>
        <h1 class="lab-title">${escapeHtml(hospital.hospital_name || 'AL-SHIFA MEDICAL CENTER')}</h1>
        <div class="lab-sub">${escapeHtml(hospital.address || '')} · Tel: ${escapeHtml(hospital.phone_primary || '')}</div>
      </td>
      <td class="doc-badge">
        <div class="doc-title">Doctors Commission Summary Report</div>
        <div class="lab-sub">Period: ${escapeHtml(dateRangeText)}</div>
      </td>
    </tr>
  </table>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-title">Active Doctors</div>
      <div class="kpi-value">${ov.totalDoctors}</div>
      <div class="kpi-sub">${ov.totalReferredVisits} referred visits</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Invoiced Billed Total</div>
      <div class="kpi-value">${fmt(ov.netRevenuePaisa)}</div>
      <div class="kpi-sub">${ov.totalTestsOrdered} tests ordered</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Earned Commission</div>
      <div class="kpi-value" style="color: #0f766e;">${fmt(ov.totalEarnedCommissionPaisa)}</div>
      <div class="kpi-sub">Total doctors share</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-title">Total Paid</div>
      <div class="kpi-value" style="color: #047857;">${fmt(ov.totalPaidPaisa)}</div>
      <div class="kpi-sub">Disbursed payouts</div>
    </div>
    <div class="kpi-card" style="border-color: ${ov.remainingBalancePaisa > 0 ? '#fecaca' : '#a7f3d0'}; background: ${ov.remainingBalancePaisa > 0 ? '#fef2f2' : '#ecfdf5'};">
      <div class="kpi-title" style="color: ${balanceColor};">Remaining Balance</div>
      <div class="kpi-value" style="color: ${balanceColor};">${fmt(ov.remainingBalancePaisa)}</div>
      <div class="kpi-sub" style="color: ${balanceColor};">${ov.remainingBalancePaisa > 0 ? 'Outstanding payable' : 'Fully settled'}</div>
    </div>
  </div>

  <div class="sec-title">Referring Doctors Commission Breakdown</div>
  <table>
    <thead>
      <tr>
        <th style="width: 5%; text-align: center;">#</th>
        <th style="width: 25%;">Doctor Name</th>
        <th style="width: 8%;" class="num">Rate</th>
        <th style="width: 8%;" class="num">Visits</th>
        <th style="width: 15%;" class="num">Invoiced Bill</th>
        <th style="width: 15%;" class="num">Earned Commission</th>
        <th style="width: 12%;" class="num">Total Paid</th>
        <th style="width: 12%;" class="num">Balance Due</th>
      </tr>
    </thead>
    <tbody>
      ${doctorRows}
    </tbody>
    <tfoot>
      <tr class="tfoot-row">
        <td colspan="3">Totals (${overview.doctors.length} Doctors)</td>
        <td class="num">${ov.totalReferredVisits}</td>
        <td class="num">${fmt(ov.netRevenuePaisa)}</td>
        <td class="num" style="color: #0f766e;">${fmt(ov.totalEarnedCommissionPaisa)}</td>
        <td class="num">${fmt(ov.totalPaidPaisa)}</td>
        <td class="num" style="color: ${balanceColor};">${fmt(ov.remainingBalancePaisa)}</td>
      </tr>
    </tfoot>
  </table>

  ${payouts.length > 0 ? `
  <div class="sec-title">Recent Settlement Payments &amp; Disbursements</div>
  <table>
    <thead>
      <tr>
        <th style="width: 15%;">Date</th>
        <th style="width: 25%;">Doctor</th>
        <th style="width: 15%;" class="num">Amount Paid</th>
        <th style="width: 15%;">Method</th>
        <th style="width: 15%;">Reference</th>
        <th style="width: 15%;">Recorded By</th>
      </tr>
    </thead>
    <tbody>
      ${recentPayoutRows}
    </tbody>
  </table>
  ` : ''}

  <div class="footer">
    <span>Generated by Clinical Laboratory Management System on ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</span>
    <span>Official Commission Summary</span>
  </div>
</body>
</html>`;
  }

  /**
   * Exports All Doctors Commission Overview to an A4 PDF document.
   */
  public static async exportAllDoctorsCommissionOverviewPdf(
    overview: DoctorCommissionOverview,
    payouts: DoctorPayoutItem[],
    hospital: HospitalSettings,
    dateRangeText: string,
    mainWindow?: BrowserWindow | null
  ): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> {
    try {
      const now = new Date().toISOString().split('T')[0];
      const defaultFilename = `Doctors_Commission_Summary_${now}.pdf`;

      const { filePath, canceled } = await dialog.showSaveDialog(mainWindow || (undefined as any), {
        title: 'Save Doctors Commission Summary Statement',
        defaultPath: defaultFilename,
        filters: [{ name: 'PDF Documents', extensions: ['pdf'] }],
      });

      if (canceled || !filePath) {
        return { success: false, cancelled: true };
      }

      const html = this.generateAllDoctorsCommissionOverviewHtml(overview, payouts, hospital, dateRangeText);

      const printWindow = new BrowserWindow({
        show: false,
        width: 800,
        height: 1100,
        webPreferences: {
          offscreen: true,
        },
      });

      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      await new Promise((resolve) => setTimeout(resolve, 300));

      const pdfBuffer = await printWindow.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        preferCSSPageSize: true,
      });

      printWindow.destroy();

      await fs.promises.writeFile(filePath, pdfBuffer);

      return { success: true, filePath };
    } catch (err: any) {
      console.error('All doctors commission summary PDF export error:', err);
      return { success: false, error: err?.message || 'Failed to export doctors commission summary PDF.' };
    }
  }

  /**
   * Prints All Doctors Commission Overview directly.
   */
  public static async printAllDoctorsCommissionOverview(
    overview: DoctorCommissionOverview,
    payouts: DoctorPayoutItem[],
    hospital: HospitalSettings,
    dateRangeText: string
  ): Promise<{ success: boolean; cancelled?: boolean; error?: string }> {
    return new Promise(async (resolve) => {
      let printWindow: BrowserWindow | null = null;
      try {
        const html = this.generateAllDoctorsCommissionOverviewHtml(overview, payouts, hospital, dateRangeText);

        printWindow = new BrowserWindow({
          show: false,
          width: 800,
          height: 1100,
          webPreferences: {
            offscreen: true,
          },
        });

        await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
        await new Promise((resolve) => setTimeout(resolve, 300));

        printWindow.webContents.print(
          {
            silent: false,
            printBackground: true,
            color: true,
          },
          (success, failureReason) => {
            if (printWindow && !printWindow.isDestroyed()) {
              printWindow.destroy();
            }
            if (!success) {
              if (failureReason === 'cancelled' || failureReason === 'Print job canceled') {
                resolve({ success: false, cancelled: true });
              } else {
                resolve({ success: false, error: failureReason || 'Print failed.' });
              }
            } else {
              resolve({ success: true });
            }
          }
        );
      } catch (err: any) {
        if (printWindow && !printWindow.isDestroyed()) {
          printWindow.destroy();
        }
        console.error('Print all doctors summary error:', err);
        resolve({ success: false, error: err?.message || 'Failed to print doctors commission summary.' });
      }
    });
  }
}
