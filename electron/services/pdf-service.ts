import { BrowserWindow, dialog } from 'electron';
import fs from 'fs';

export class PdfService {
  /**
   * Generates a local PDF of the current view / report using Electron's native printToPDF
   * and saves it safely to the operator's chosen Windows file path.
   */
  public static async exportReportPdf(
    window: BrowserWindow,
    defaultFileName: string = 'Lab_Report.pdf'
  ): Promise<{ success: boolean; filePath?: string; cancelled?: boolean; error?: string }> {
    try {
      const { canceled, filePath } = await dialog.showSaveDialog(window, {
        title: 'Save Diagnostic Laboratory Report (PDF)',
        defaultPath: defaultFileName,
        filters: [{ name: 'PDF Documents (*.pdf)', extensions: ['pdf'] }],
      });

      if (canceled || !filePath) {
        return { success: false, cancelled: true };
      }

      // Generate PDF data
      const pdfBuffer = await window.webContents.printToPDF({
        pageSize: 'A4',
        printBackground: true,
        margins: {
          top: 0.4,
          bottom: 0.4,
          left: 0.4,
          right: 0.4,
        },
      });

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

