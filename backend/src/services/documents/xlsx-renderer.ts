/**
 * XLSX Renderer — Phase 131
 *
 * Converts structured SheetData JSON into an Excel (.xlsx) buffer using the
 * exceljs library.
 */

import ExcelJS from 'exceljs';
import { logger } from '../../utils/logger';
import type { SheetData, DocumentStyle, RenderResult } from './types';

const DEFAULT_PRIMARY = '#1a73e8';

export async function renderXlsx(
  sheets: SheetData[],
  style?: DocumentStyle,
): Promise<RenderResult> {
  logger.debug('renderXlsx: starting', { sheetCount: sheets.length });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'ZenAI';
  workbook.created = new Date();

  const primaryArgb =
    'FF' + (style?.primaryColor ?? DEFAULT_PRIMARY).replace(/^#/, '').toUpperCase();

  for (const sheetData of sheets) {
    const worksheet = workbook.addWorksheet(sheetData.name);

    // Header row — bold + primary background
    if (sheetData.headers.length) {
      const headerRow = worksheet.addRow(sheetData.headers);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: primaryArgb },
      };
      headerRow.commit();
    }

    // Data rows
    for (const row of sheetData.rows) {
      worksheet.addRow(row);
    }

    // Auto-fit columns (approximate)
    worksheet.columns.forEach((col) => {
      if (!col.values) {return;}
      let maxLen = 10;
      col.values.forEach((v) => {
        if (v !== null && v !== undefined) {
          const len = String(v).length;
          if (len > maxLen) {maxLen = len;}
        }
      });
      col.width = Math.min(maxLen + 2, 50);
    });

    // Chart note (ExcelJS chart API is limited; add a text note instead)
    if (sheetData.chartType) {
      const noteRow = worksheet.addRow([
        `[Chart: ${sheetData.chartTitle ?? sheetData.chartType} — type: ${sheetData.chartType}]`,
      ]);
      noteRow.font = { italic: true, color: { argb: 'FF888888' } };
      noteRow.commit();
      logger.debug('renderXlsx: chart placeholder added', {
        sheet: sheetData.name,
        chartType: sheetData.chartType,
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();

  logger.info('renderXlsx: done', { sheetCount: sheets.length, bytes: buffer.byteLength });

  return {
    buffer: Buffer.from(buffer),
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx',
    pageCount: sheets.length,
  };
}
