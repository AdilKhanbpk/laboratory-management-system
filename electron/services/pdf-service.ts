import { BrowserWindow, dialog } from 'electron';
import fs from 'fs';
import { FullDiagnosticReport, ReportTemplate, HospitalSettings } from '../types/ipc';
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

            let statusText = 'Normal';
            if (isCritical) statusText = 'Critical';
            else if (isHigh) statusText = 'High';
            else if (isLow) statusText = 'Low';

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
                  const statusClass = statusText.toLowerCase();
                  return `<td class="param-status status-${statusClass}">${statusText}</td>`;
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
      <div class="section-box">
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
      <div class="section-box">
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
      height: 100%;
      margin: 0;
      padding: 0;
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
    }
    .section-box {
      margin-top: 10px;
      border: 1px solid #94a3b8;
      page-break-inside: avoid;
    }
    .section-title {
      background: #d6edf3;
      padding: 4px 8px;
      color: #0f3e74;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
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
      page-break-inside: avoid;
    }
    .test-header {
      border-bottom: 1px solid #0f766e;
      padding: 2px 4px;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
      align-items: baseline;
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
    .status-high, .status-low, .status-critical {
      font-weight: 700;
      color: #b91c1c;
    }
    .status-normal {
      font-weight: 700;
      color: #15803d;
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
      <div class="section-box" style="margin-top: 10px;">
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
              result: { id: 1, order_item_id: 1, parameter_id: 1, numeric_value: 14.2, result_value: '14.2', unit_snapshot: 'g/dL', reference_range_display: '13.0 - 17.0 g/dL', flag: 'normal', status: 'finalized', entered_by: 1, entered_at: new Date().toISOString(), version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
              flag: 'normal',
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
              result: { id: 3, order_item_id: 1, parameter_id: 3, numeric_value: 250, result_value: '250', unit_snapshot: 'x10^9/L', reference_range_display: '150 - 400 x10^9/L', flag: 'normal', status: 'finalized', entered_by: 1, entered_at: new Date().toISOString(), version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
              flag: 'normal',
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
}
