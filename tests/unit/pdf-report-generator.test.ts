import { describe, it, expect } from 'vitest';
import { PdfService } from '../../electron/services/pdf-service';
import { FullDiagnosticReport } from '../../electron/types/ipc';

describe('PDF Report Generator: Multi-Page Pagination & Empty Reference Range Flags', () => {
  const baseReport = {
    visit: {
      id: 1,
      visit_number: '2026-00010',
      patient_id: 1,
      referring_doctor_id: 1,
      order_date: '2026-10-28T18:07:00.000Z',
      status: 'completed',
      operator_id: 1,
      created_at: '2026-10-28T18:07:00.000Z',
      updated_at: '2026-10-28T18:07:00.000Z',
    },
    patient: {
      id: 1,
      patient_mrn: 'PAT-2026-00010',
      full_name: 'M. Yahya',
      date_of_birth: '2001-10-28',
      gender: 'male',
      phone_number: '—',
      address: null,
      notes: null,
      created_at: '2026-10-28T18:07:00.000Z',
      updated_at: '2026-10-28T18:07:00.000Z',
    },
    doctor: {
      id: 1,
      full_name: 'Dr. Saad',
      specialization: 'Medical Specialist',
      phone_number: '0315-1996504',
      clinic_hospital_name: null,
      address: null,
      notes: null,
      commission_percentage: 0,
      is_active: 1,
      created_at: '2026-10-28T18:07:00.000Z',
      updated_at: '2026-10-28T18:07:00.000Z',
    },
    hospital: {
      id: 1,
      hospital_name: 'AL-SHIFA MEDICAL CENTER',
      tagline: null,
      address: 'Zaida Road, Mohalla Panch Paao, Kohat',
      phone_primary: '0938-281507',
      phone_secondary: '0315-1996504',
      email: 'info@alshifalab.com',
      logo_relative_path: null,
      logo_url: undefined,
      currency_code: 'PKR',
      timezone: 'Asia/Karachi',
      inactivity_timeout_minutes: 15,
      created_at: '2026-10-28T18:07:00.000Z',
      updated_at: '2026-10-28T18:07:00.000Z',
    },
    snapshot: {
      report_number: 'REP-2026-00010',
    },
    tests: [
      {
        orderItem: {
          id: 1,
          visit_id: 1,
          test_id: 1,
          test_name_snapshot: 'URINE R/E',
          test_code_snapshot: 'URINE-R-E',
          price_snapshot: 30000,
          quantity: 1,
          subtotal_amount: 30000,
          status: 'completed',
          created_at: '2026-10-28T18:07:00.000Z',
        },
        results: [
          {
            parameter: { id: 1, name: 'COLOR', unit: '', type: 'text', displayOrder: 1 },
            result: { id: 1, order_item_id: 1, parameter_id: 1, numeric_value: null, result_value: 'P-yellow', unit_snapshot: null, reference_range_display: null, flag: 'unconfigured', status: 'finalized', entered_by: 1, entered_at: '', version: 1, created_at: '', updated_at: '' },
            flag: 'unconfigured',
            referenceRangeDisplay: '—',
          },
          {
            parameter: { id: 2, name: 'PH', unit: '', type: 'numeric', displayOrder: 2 },
            result: { id: 2, order_item_id: 1, parameter_id: 2, numeric_value: 6.0, result_value: '6.0', unit_snapshot: '', reference_range_display: '5 - 7', flag: 'normal', status: 'finalized', entered_by: 1, entered_at: '', version: 1, created_at: '', updated_at: '' },
            flag: 'normal',
            referenceRangeDisplay: '5 - 7',
          },
          {
            parameter: { id: 3, name: 'PROTEIN', unit: '', type: 'text', displayOrder: 3 },
            result: { id: 3, order_item_id: 1, parameter_id: 3, numeric_value: null, result_value: 'TRACE', unit_snapshot: '', reference_range_display: 'Nil', flag: 'high', status: 'finalized', entered_by: 1, entered_at: '', version: 1, created_at: '', updated_at: '' },
            flag: 'high',
            referenceRangeDisplay: 'Nil',
          },
          {
            parameter: { id: 4, name: 'MALARIA PARASITE', unit: '', type: 'text', displayOrder: 4 },
            result: { id: 4, order_item_id: 1, parameter_id: 4, numeric_value: null, result_value: 'NEGATIVE', unit_snapshot: '', reference_range_display: '', flag: 'unconfigured', status: 'finalized', entered_by: 1, entered_at: '', version: 1, created_at: '', updated_at: '' },
            flag: 'unconfigured',
            referenceRangeDisplay: '',
          },
        ],
      },
    ],
    template: {
      id: 'al-shifa-default',
      name: 'Al-Shifa Default',
      active: true,
      header: {
        hospitalName: 'AL-SHIFA MEDICAL CENTER',
        reportTitle: 'LAB TEST REPORT',
        supervisor: 'Dr. Saad Khan',
        address: 'Zaida Road, Mohalla Panch Paao, Kohat',
        phone: '0938-281507',
        mobile: '0315-1996504',
        whatsapp: '0333-6990007',
        color: '#124779',
        accentColor: '#079b98',
        showBadge: true,
        badgeText: '24 Hours Service',
      },
      columns: [
        { key: 'testName', label: 'Test Name', visible: true },
        { key: 'result', label: 'Result', visible: true },
        { key: 'unit', label: 'Unit', visible: true },
        { key: 'normalRange', label: 'Normal Range', visible: true },
        { key: 'status', label: 'Status / Flag', visible: true },
      ],
      style: {
        fontFamily: 'Arial',
        fontSize: 10,
        showPatientBox: true,
      },
      observations: {
        visible: false,
      },
      footer: {
        visible: true,
        text: 'Thank you for trusting AL-SHIFA MEDICAL CENTER | Dr. Saad Khan',
        rightText: 'Lab Technition | Muhammad Ahsan',
        color: '#124779',
      },
    },
  };

  it('does NOT display "Normal" or any flag when the reference range is empty or dash', () => {
    const html = PdfService.generateReportHtml(baseReport as unknown as FullDiagnosticReport);

    // COLOR has range '—': must NOT show 'Normal'
    expect(html).not.toContain('COLOR</td><td class="param-result val-normal">P-yellow</td><td class="param-unit">—</td><td class="param-range">—</td><td class="param-status status-normal">Normal</td>');
    expect(html).toContain('COLOR</td><td class="param-result val-normal">P-yellow</td><td class="param-unit">—</td><td class="param-range">—</td><td class="param-status text-slate-400" style="color: #94a3b8;">—</td>');

    // MALARIA PARASITE has empty range: must NOT show 'Normal'
    expect(html).not.toContain('MALARIA PARASITE</td><td class="param-result val-normal">NEGATIVE</td><td class="param-unit">—</td><td class="param-range">—</td><td class="param-status status-normal">Normal</td>');
    expect(html).toContain('MALARIA PARASITE</td><td class="param-result val-normal">NEGATIVE</td><td class="param-unit">—</td><td class="param-range">—</td><td class="param-status text-slate-400" style="color: #94a3b8;">—</td>');

    // PH has range '5 - 7': must show 'Normal'
    expect(html).toContain('PH</td><td class="param-result val-normal">6.0</td><td class="param-unit">—</td><td class="param-range">5 - 7</td><td class="param-status status-normal">Normal</td>');

    // PROTEIN has range 'Nil': must show 'High'
    expect(html).toContain('PROTEIN</td><td class="param-result val-abnormal">TRACE</td><td class="param-unit">—</td><td class="param-range">Nil</td><td class="param-status status-high">High</td>');
  });

  it('allows natural page splitting for test results across A4 pages', () => {
    const html = PdfService.generateReportHtml(baseReport as unknown as FullDiagnosticReport);

    // .results-section must have break-inside: auto
    expect(html).toContain('.results-section {');
    expect(html).toContain('page-break-inside: auto;');
    expect(html).toContain('break-inside: auto;');

    // The test results wrapper must use results-section
    expect(html).toContain('<div class="section-box results-section" style="margin-top: 10px;">');

    // Patient box must avoid breaking
    expect(html).toContain('.patient-box');

    // Table rows must avoid breaking mid-row
    expect(html).toContain('.results-table tr {');
    expect(html).toContain('page-break-inside: avoid;');

    // Table header must repeat on new pages
    expect(html).toContain('.results-table thead {\n      display: table-header-group;');
  });
});

