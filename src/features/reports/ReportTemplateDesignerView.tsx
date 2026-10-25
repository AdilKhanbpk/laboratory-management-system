import React, { useEffect, useMemo, useState, useCallback } from 'react';
import './ReportTemplateDesigner.css';
import type { ReportTemplate } from '../../types';
import { Palette, CheckCircle2, AlertCircle, Plus, Trash2, Printer, RefreshCw, Download } from 'lucide-react';

const DEFAULT_TEMPLATE: ReportTemplate = {
  id: 'al-shifa-default',
  name: 'Al-Shifa Default',
  active: true,
  header: {
    logoDataUrl: '',
    hospitalName: 'AL-SHIFA MEDICAL CENTER',
    reportTitle: 'LAB TEST REPORT',
    supervisor: 'Dr. Saad Khan',
    address: 'Peshawar Swabi Road, Mohalla Panch Paao, Kohat',
    phone: '0938-281507',
    mobile: '0315-1996504',
    whatsapp: '0333-9995967',
    badgeText: '24 Ghantay Service',
    showBadge: true,
    showLogo: true,
    color: '#124779',
    accentColor: '#079b98',
    align: 'left',
  },
  patientFields: [
    'Patient Name',
    'Age / Gender',
    'Date',
    'Report No.',
    'C/O No.',
    'S/O,D/O,W/O',
    'Referring Physician',
    'Sample Collected',
  ],
  columns: [
    { key: 'testName', label: 'Test Name', visible: true },
    { key: 'result', label: 'Result', visible: true },
    { key: 'unit', label: 'Unit', visible: true },
    { key: 'normalRange', label: 'Normal Range', visible: true },
    { key: 'status', label: 'Status / Flag', visible: true },
  ],
  observations: {
    visible: true,
    title: 'COMPUTER TEST RESULTS / OBSERVATIONS',
    defaultText: '',
  },
  footer: {
    visible: true,
    text: 'Thank you for trusting AL-SHIFA MEDICAL CENTER | Dr. Saad Khan',
    rightText: 'AL-SHIFA | Dr. Saad Khan',
    color: '#124779',
  },
  style: {
    fontFamily: 'Arial',
    fontSize: 10,
    showPatientBox: true,
  },
};

const SAMPLE_PATIENT = {
  patientName: 'Muhammad Ali',
  ageGender: '32 Years / Male',
  date: new Date().toLocaleDateString('en-GB'),
  reportNo: 'REP-2026-00042',
  coNo: 'C-8812',
  Phone: '03178261618',
  physician: 'Dr. Saad Khan',
  sample: 'Whole Blood (EDTA)',
};

const SAMPLE_RESULTS: Array<Record<string, string>> = [
  { testName: 'Hemoglobin (Hb)', result: '11.2', unit: 'g/dL', normalRange: 'M: 13.0 - 17.0 | F: 11.5 - 15.5', status: 'Low' },
  { testName: 'Total Leukocyte Count (TLC)', result: '12.1', unit: 'x10^9/L', normalRange: '4.0 - 11.0', status: 'High' },
  { testName: 'Platelet Count', result: '18', unit: 'x10^9/L', normalRange: '150 - 400', status: 'Critical' },
  { testName: 'Blood Glucose (Fasting)', result: '95', unit: 'mg/dL', normalRange: '70 - 100', status: 'Normal' },
];

export const ReportTemplateDesignerView: React.FC = () => {
  const [templates, setTemplates] = useState<ReportTemplate[]>([DEFAULT_TEMPLATE]);
  const [selectedId, setSelectedId] = useState<string>(DEFAULT_TEMPLATE.id);
  const [draft, setDraft] = useState<ReportTemplate>(DEFAULT_TEMPLATE);
  const [tab, setTab] = useState<'header' | 'body' | 'footer' | 'style'>('header');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sampleRows, setSampleRows] = useState(SAMPLE_RESULTS);
  const [isPrintingTest, setIsPrintingTest] = useState(false);
  const [isExportingTestPdf, setIsExportingTestPdf] = useState(false);

  const handlePrintTest = async () => {
    setIsPrintingTest(true);
    try {
      if (window.electronAPI?.templates?.printTest) {
        const res = await window.electronAPI.templates.printTest(draft);
        if (!res.success && res.error) {
          setNotice({ type: 'error', text: res.error });
        }
      } else {
        window.print();
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Print failed.' });
    } finally {
      setIsPrintingTest(false);
    }
  };

  const handleExportTestPdf = async () => {
    setIsExportingTestPdf(true);
    try {
      if (window.electronAPI?.templates?.exportPdfTest) {
        const res = await window.electronAPI.templates.exportPdfTest(draft);
        if (res.success && (res.data as any)?.filePath) {
          setNotice({ type: 'success', text: `Sample PDF saved to ${(res.data as any).filePath}` });
        } else if (!res.success && res.error) {
          setNotice({ type: 'error', text: res.error });
        }
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'PDF export failed.' });
    } finally {
      setIsExportingTestPdf(false);
    }
  };

  const loadTemplatesFromDatabase = useCallback(async () => {
    setIsLoading(true);
    try {
      if (window.electronAPI?.templates) {
        const res = await window.electronAPI.templates.list();
        if (res.success && res.data && res.data.length > 0) {
          setTemplates(res.data);
          const active = res.data.find((t) => t.active) || res.data[0];
          setDraft(active);
          setSelectedId(active.id);
        }
      }
    } catch (err: any) {
      console.error('Failed to load report templates:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTemplatesFromDatabase();
  }, [loadTemplatesFromDatabase]);

  const visibleColumns = useMemo(() => draft.columns.filter((c) => c.visible), [draft.columns]);

  const update = (path: string, value: any) => {
    setDraft((prev) => {
      const next = structuredClone(prev) as any;
      const keys = path.split('.');
      let target = next;
      for (const key of keys.slice(0, -1)) {
        target = target[key];
      }
      target[keys[keys.length - 1]] = value;
      return next as ReportTemplate;
    });
  };

  const chooseTemplate = (id: string) => {
    const found = templates.find((t) => t.id === id);
    if (found) {
      setDraft(structuredClone(found));
      setSelectedId(id);
      setNotice(null);
    }
  };

  const saveTemplate = async () => {
    const name = draft.name.trim();
    if (!name) {
      setNotice({ type: 'error', text: 'Please enter a design name.' });
      return;
    }

    const id = draft.id || `template-${Date.now()}`;
    const toSave: ReportTemplate = { ...draft, id, name, active: !!draft.active };

    try {
      if (window.electronAPI?.templates) {
        const res = await window.electronAPI.templates.save(toSave);
        if (res.success && res.data) {
          await loadTemplatesFromDatabase();
          setSelectedId(res.data.id);
          setDraft(res.data);
          setNotice({ type: 'success', text: `Template "${name}" saved securely in database.` });
        } else {
          setNotice({ type: 'error', text: res.error || 'Failed to save template.' });
        }
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Error saving template.' });
    }
  };

  const newTemplate = () => {
    const fresh: ReportTemplate = {
      ...structuredClone(DEFAULT_TEMPLATE),
      id: `template-${Date.now()}`,
      name: 'Custom Lab Design',
      active: false,
    };
    setDraft(fresh);
    setSelectedId(fresh.id);
    setTab('header');
    setNotice({ type: 'success', text: 'New blank template created. Click "Save design" when ready.' });
  };

  const activateTemplate = async () => {
    const id = draft.id;
    if (!id) {
      setNotice({ type: 'error', text: 'Please save this template before activating it.' });
      return;
    }

    try {
      if (window.electronAPI?.templates) {
        const res = await window.electronAPI.templates.activate(id);
        if (res.success) {
          await loadTemplatesFromDatabase();
          setNotice({ type: 'success', text: `"${draft.name}" is now the ACTIVE report design across the entire laboratory!` });
        } else {
          setNotice({ type: 'error', text: res.error || 'Failed to activate template.' });
        }
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Error activating template.' });
    }
  };

  const deleteTemplate = async () => {
    if (!draft.id) return;
    if (draft.active) {
      setNotice({ type: 'error', text: 'Cannot delete the currently active template. Activate another design first.' });
      return;
    }

    if (!window.confirm(`Are you sure you want to delete design "${draft.name}"?`)) return;

    try {
      if (window.electronAPI?.templates) {
        const res = await window.electronAPI.templates.delete(draft.id);
        if (res.success) {
          await loadTemplatesFromDatabase();
          setNotice({ type: 'success', text: 'Design deleted successfully.' });
        } else {
          setNotice({ type: 'error', text: res.error || 'Failed to delete template.' });
        }
      }
    } catch (err: any) {
      setNotice({ type: 'error', text: err?.message || 'Error deleting template.' });
    }
  };

  const addColumn = () => {
    setDraft((prev) => ({
      ...prev,
      columns: [
        ...prev.columns,
        { key: `custom_${Date.now()}`, label: 'New Column', visible: true },
      ],
    }));
  };

  const editColumn = (index: number, key: 'label' | 'visible', value: any) => {
    setDraft((prev) => ({
      ...prev,
      columns: prev.columns.map((c, i) => (i === index ? { ...c, [key]: value } : c)),
    }));
  };

  const removeColumn = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      columns: prev.columns.filter((_, i) => i !== index),
    }));
  };

  const addResultRow = () => {
    setSampleRows((prev) => [
      ...prev,
      { testName: 'New Test Parameter', result: '—', unit: '', normalRange: '—', status: 'Normal' },
    ]);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setNotice({ type: 'error', text: 'Please select an image file (PNG, JPG, SVG).' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      update('header.logoDataUrl', String(reader.result));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="lrtd-shell select-text">
      {/* Top Header */}
      <div className="lrtd-topbar">
        <div>
          <h1 className="flex items-center gap-2">
            <Palette className="w-5 h-5 text-[#0F766E]" />
            Report Template Designer
          </h1>
          <p>
            Customize laboratory report headers, doctor supervision lines, columns, observations, and footers.
          </p>
        </div>
        <div className="lrtd-top-actions">
          <button type="button" className="lrtd-btn secondary" onClick={newTemplate}>
            <Plus className="w-4 h-4 inline mr-1" />
            New design
          </button>
          <button type="button" className="lrtd-btn ghost" onClick={loadTemplatesFromDatabase} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 inline mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Reload
          </button>
        </div>
      </div>

      <div className="lrtd-layout">
        {/* Left Side: Controls & Settings */}
        <aside className="lrtd-sidebar">
          <label className="lrtd-label">Saved designs</label>
          <select
            value={selectedId}
            onChange={(e) => chooseTemplate(e.target.value)}
            className="lrtd-input font-medium"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} {t.active ? '★ (Active)' : ''}
              </option>
            ))}
          </select>

          <label className="lrtd-label">Design name</label>
          <input
            className="lrtd-input"
            value={draft.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Al-Shifa Official Design"
          />

          {/* Navigation Tabs */}
          <div className="lrtd-tabs">
            {(
              [
                ['header', 'Header'],
                ['body', 'Report body'],
                ['footer', 'Footer'],
                ['style', 'Page style'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={tab === key ? 'selected' : ''}
                onClick={() => setTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="lrtd-controls">
            {/* TAB 1: HEADER */}
            {tab === 'header' && (
              <>
                <h3>Header Details</h3>
                <label className="lrtd-check">
                  <input
                    type="checkbox"
                    checked={draft.header.showLogo}
                    onChange={(e) => update('header.showLogo', e.target.checked)}
                  />
                  Show hospital logo
                </label>

                {draft.header.showLogo && (
                  <div className="space-y-1.5 mb-3">
                    <label className="lrtd-label !mt-0">Hospital Logo Image</label>
                    <input type="file" accept="image/*" onChange={handleLogoUpload} className="text-xs" />
                    {draft.header.logoDataUrl && (
                      <button
                        type="button"
                        className="lrtd-link block"
                        onClick={() => update('header.logoDataUrl', '')}
                      >
                        Remove logo image
                      </button>
                    )}
                  </div>
                )}

                <label className="lrtd-label">
                  Line 1: Hospital Name
                  <input
                    className="lrtd-input font-bold"
                    value={draft.header.hospitalName}
                    onChange={(e) => update('header.hospitalName', e.target.value)}
                  />
                </label>

                <label className="lrtd-label">
                  Line 2: Report Title
                  <input
                    className="lrtd-input font-bold"
                    value={draft.header.reportTitle}
                    onChange={(e) => update('header.reportTitle', e.target.value)}
                  />
                </label>

                <label className="lrtd-label">
                  Line 3: Supervision Doctor
                  <input
                    className="lrtd-input font-medium"
                    value={draft.header.supervisor}
                    onChange={(e) => update('header.supervisor', e.target.value)}
                  />
                </label>

                <label className="lrtd-label">
                  Line 4: Address
                  <input
                    className="lrtd-input"
                    value={draft.header.address}
                    onChange={(e) => update('header.address', e.target.value)}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <label className="lrtd-label">
                    Phone
                    <input
                      className="lrtd-input"
                      value={draft.header.phone}
                      onChange={(e) => update('header.phone', e.target.value)}
                    />
                  </label>
                  <label className="lrtd-label">
                    Mobile
                    <input
                      className="lrtd-input"
                      value={draft.header.mobile}
                      onChange={(e) => update('header.mobile', e.target.value)}
                    />
                  </label>
                </div>

                <label className="lrtd-label">
                  WhatsApp
                  <input
                    className="lrtd-input"
                    value={draft.header.whatsapp}
                    onChange={(e) => update('header.whatsapp', e.target.value)}
                  />
                </label>

                <div className="pt-2 border-t border-slate-100">
                  <label className="lrtd-check">
                    <input
                      type="checkbox"
                      checked={draft.header.showBadge !== false}
                      onChange={(e) => update('header.showBadge', e.target.checked)}
                    />
                    Show top-right service badge
                  </label>

                  {draft.header.showBadge !== false && (
                    <label className="lrtd-label !mt-1">
                      Badge Text
                      <input
                        className="lrtd-input"
                        value={draft.header.badgeText || ''}
                        onChange={(e) => update('header.badgeText', e.target.value)}
                        placeholder="e.g. 24 Ghantay Service"
                      />
                    </label>
                  )}
                </div>

                <div className="lrtd-color-row">
                  <label>
                    Header Banner
                    <input
                      type="color"
                      value={draft.header.color}
                      onChange={(e) => update('header.color', e.target.value)}
                    />
                  </label>
                  <label>
                    Accent Stripe
                    <input
                      type="color"
                      value={draft.header.accentColor}
                      onChange={(e) => update('header.accentColor', e.target.value)}
                    />
                  </label>
                </div>
              </>
            )}

            {/* TAB 2: REPORT BODY */}
            {tab === 'body' && (
              <>
                <h3>Result Table Columns</h3>
                <p className="lrtd-help">Check columns to display or edit their header titles.</p>
                {draft.columns.map((column, index) => (
                  <div className="lrtd-column-edit" key={column.key}>
                    <input
                      type="checkbox"
                      aria-label="Show column"
                      checked={column.visible}
                      onChange={(e) => editColumn(index, 'visible', e.target.checked)}
                    />
                    <input
                      className="lrtd-input"
                      value={column.label}
                      onChange={(e) => editColumn(index, 'label', e.target.value)}
                    />
                    <button
                      type="button"
                      title="Remove column"
                      className="lrtd-icon-btn"
                      onClick={() => removeColumn(index)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <button type="button" className="lrtd-btn secondary full" onClick={addColumn}>
                  ＋ Add column
                </button>

                <h3 className="mt-5">Observations Section</h3>
                <label className="lrtd-check">
                  <input
                    type="checkbox"
                    checked={draft.observations.visible}
                    onChange={(e) => update('observations.visible', e.target.checked)}
                  />
                  Show observations section
                </label>

                {draft.observations.visible && (
                  <>
                    <label className="lrtd-label">
                      Section Title
                      <input
                        className="lrtd-input"
                        value={draft.observations.title}
                        onChange={(e) => update('observations.title', e.target.value)}
                      />
                    </label>
                    <label className="lrtd-label">
                      Default Observation Text
                      <textarea
                        className="lrtd-input"
                        rows={3}
                        value={draft.observations.defaultText}
                        onChange={(e) => update('observations.defaultText', e.target.value)}
                        placeholder="Optional remarks, microscope findings or machine notes..."
                      />
                    </label>
                  </>
                )}
              </>
            )}

            {/* TAB 3: FOOTER */}
            {tab === 'footer' && (
              <>
                <h3>Footer Settings</h3>
                <label className="lrtd-check font-medium">
                  <input
                    type="checkbox"
                    checked={draft.footer.visible}
                    onChange={(e) => update('footer.visible', e.target.checked)}
                  />
                  Show bottom footer banner
                </label>
                <p className="lrtd-help">
                  Uncheck this if printing on official pre-printed hospital letterhead paper.
                </p>

                {draft.footer.visible && (
                  <>
                    <label className="lrtd-label">
                      Left Footer Text
                      <textarea
                        className="lrtd-input"
                        rows={3}
                        value={draft.footer.text}
                        onChange={(e) => update('footer.text', e.target.value)}
                      />
                    </label>
                    <label className="lrtd-label">
                      Right Footer Text
                      <input
                        className="lrtd-input"
                        value={draft.footer.rightText}
                        onChange={(e) => update('footer.rightText', e.target.value)}
                      />
                    </label>
                    <label className="lrtd-label">
                      Footer Background Color
                      <input
                        type="color"
                        value={draft.footer.color}
                        onChange={(e) => update('footer.color', e.target.value)}
                      />
                    </label>
                  </>
                )}
              </>
            )}

            {/* TAB 4: STYLE */}
            {tab === 'style' && (
              <>
                <h3>Page Typography & Style</h3>
                <label className="lrtd-label">
                  Font Family
                  <select
                    className="lrtd-input"
                    value={draft.style.fontFamily}
                    onChange={(e) => update('style.fontFamily', e.target.value)}
                  >
                    <option value="Arial">Arial (Clean standard)</option>
                    <option value="Calibri">Calibri</option>
                    <option value="Segoe UI">Segoe UI</option>
                    <option value="Tahoma">Tahoma</option>
                    <option value="Times New Roman">Times New Roman</option>
                  </select>
                </label>

                <label className="lrtd-label">
                  Base Font Size (px)
                  <input
                    type="number"
                    min="8"
                    max="14"
                    className="lrtd-input"
                    value={draft.style.fontSize}
                    onChange={(e) => update('style.fontSize', Number(e.target.value))}
                  />
                </label>

                <label className="lrtd-check">
                  <input
                    type="checkbox"
                    checked={draft.style.showPatientBox}
                    onChange={(e) => update('style.showPatientBox', e.target.checked)}
                  />
                  Show patient details box
                </label>
              </>
            )}
          </div>

          {/* Action Buttons */}
          <div className="lrtd-save-actions">
            <button type="button" className="lrtd-btn primary" onClick={saveTemplate}>
              Save design
            </button>
            <button
              type="button"
              className={`lrtd-btn ${draft.active ? 'ghost opacity-60 cursor-not-allowed' : 'secondary'}`}
              onClick={activateTemplate}
              disabled={draft.active}
            >
              {draft.active ? '★ Currently active' : 'Set as active'}
            </button>
            {!draft.active && (
              <button type="button" className="lrtd-btn danger" onClick={deleteTemplate}>
                Delete
              </button>
            )}
          </div>

          {notice && (
            <div
              className={`lrtd-notice flex items-start gap-2 ${
                notice.type === 'error' ? '!bg-red-50 !text-red-700 !border-red-200' : ''
              }`}
              role="status"
            >
              {notice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              )}
              <span>{notice.text}</span>
            </div>
          )}
        </aside>

        {/* Right Side: Live A4 Report Sheet Preview */}
        <main className="lrtd-preview-area">
          <div className="lrtd-preview-toolbar">
            <div>
              <strong>Live Print Preview</strong>
              <span> · Standard A4 Pathology Sheet</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="lrtd-btn secondary text-xs"
                onClick={handleExportTestPdf}
                disabled={isExportingTestPdf || isPrintingTest}
                title="Save the sample test report as a PDF file"
              >
                <Download className="w-3.5 h-3.5 inline mr-1" />
                {isExportingTestPdf ? 'Exporting…' : 'Save as PDF'}
              </button>
              <button
                type="button"
                className="lrtd-btn primary text-xs"
                onClick={handlePrintTest}
                disabled={isPrintingTest || isExportingTestPdf}
                title="Print this report using the native printer dialog"
              >
                <Printer className="w-3.5 h-3.5 inline mr-1" />
                {isPrintingTest ? 'Printing…' : 'Print test'}
              </button>
            </div>
          </div>

          {/* Printable A4 Paper */}
          <article
            className="lrtd-paper"
            style={{
              fontFamily: draft.style.fontFamily,
              fontSize: `${draft.style.fontSize}px`,
            }}
          >
            <div className="lrtd-paper-content">
              {/* Header Banner */}
              <header
                className="lrtd-report-header"
                style={{
                  background: draft.header.color,
                  textAlign: draft.header.align,
                }}
              >
              {draft.header.showLogo && draft.header.logoDataUrl && (
                <img className="lrtd-logo" src={draft.header.logoDataUrl} alt="Hospital Logo" />
              )}
              <div className="lrtd-header-copy">
                <div className="lrtd-hospital-name">{draft.header.hospitalName}</div>
                <div className="lrtd-report-title">{draft.header.reportTitle}</div>
                <div className="lrtd-supervisor">Under Supervision of: {draft.header.supervisor}</div>
              </div>
              {draft.header.showBadge !== false && (
                <div className="lrtd-service-badge">
                  {draft.header.badgeText || '24 Ghantay Service'}
                </div>
              )}
            </header>

            {/* Accent Line */}
            <div className="lrtd-accent-line" style={{ background: draft.header.accentColor }} />

            {/* Address & Contacts */}
            <div className="lrtd-contact-line">
              <div className="font-semibold">{draft.header.address}</div>
              <div>
                Phone: {draft.header.phone} &nbsp;|&nbsp; Mob: {draft.header.mobile} &nbsp;|&nbsp; WhatsApp: {draft.header.whatsapp}
              </div>
            </div>

            {/* Patient Details */}
            {draft.style.showPatientBox && (
              <section className="lrtd-patient-box">
                <h3 style={{ background: '#d6edf3' }}>PATIENT DETAILS</h3>
                <div className="lrtd-patient-grid">
                  <span>
                    Patient Name: <b>{SAMPLE_PATIENT.patientName}</b>
                  </span>
                  <span>
                    Age / Gender: <b>{SAMPLE_PATIENT.ageGender}</b>
                  </span>
                  <span>
                    Date: <b>{SAMPLE_PATIENT.date}</b>
                  </span>
                  <span>
                    Report No.: <b>{SAMPLE_PATIENT.reportNo}</b>
                  </span>
                  <span>
                    C/O No.: <b>{SAMPLE_PATIENT.coNo}</b>
                  </span>
                  <span>
                    Phone: <b>{SAMPLE_PATIENT.Phone}</b>
                  </span>
                  <span>
                    Referring Physician: <b>{SAMPLE_PATIENT.physician}</b>
                  </span>
                  {/* <span>
                    Sample Collected: <b>{SAMPLE_PATIENT.sample}</b>
                  </span> */}
                </div>
              </section>
            )}

            {/* Lab Test Results */}
            <section className="lrtd-results">
              <h3 style={{ background: '#d6edf3' }}>LAB TEST RESULTS</h3>
              <table>
                <thead>
                  <tr>
                    {visibleColumns.map((c) => (
                      <th key={c.key} style={{ background: draft.header.accentColor }}>
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sampleRows.map((row, index) => (
                    <tr key={index}>
                      {visibleColumns.map((c) => (
                        <td
                          key={c.key}
                          className={
                            c.key === 'status'
                              ? `lrtd-status ${String(row[c.key] || '').toLowerCase()}`
                              : ''
                          }
                        >
                          {row[c.key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="lrtd-add-row no-print" onClick={addResultRow}>
                ＋ Add preview row
              </button>
            </section>

            {/* Observations Section */}
            {draft.observations.visible && (
              <section className="lrtd-observations">
                <h3 style={{ background: '#d6edf3' }}>
                  {draft.observations.title || 'COMPUTER TEST RESULTS / OBSERVATIONS'}
                </h3>
                <div>
                  {draft.observations.defaultText ||
                    'Specimen processed on automated clinical pathology analyzers. All calibration and internal quality control values within acceptable limits. Test results to be clinically correlated with patient symptoms.'}
                </div>
              </section>
            )}
            </div>

            {/* Bottom Footer Banner */}
            {draft.footer.visible && (
              <footer className="lrtd-report-footer" style={{ background: draft.footer.color }}>
                <span>{draft.footer.text}</span>
                <span>{draft.footer.rightText}</span>
              </footer>
            )}
          </article>
        </main>
      </div>
    </div>
  );
};

