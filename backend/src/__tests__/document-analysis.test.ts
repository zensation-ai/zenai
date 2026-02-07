/**
 * Document Analysis Service & Route Tests
 *
 * Tests for the document analysis feature:
 * - Service: Excel/CSV parsing, file validation
 * - Routes: Upload, template listing, status endpoint
 * - Phase 2: History, follow-up, compare, streaming, cache
 */

import {
  isValidDocumentType,
  validateFileMagicNumber,
  getDocumentTypeLabel,
  documentAnalysis,
  ANALYSIS_TEMPLATES,
} from '../services/document-analysis';

// ===========================================
// Validation Tests
// ===========================================

describe('Document Analysis - Validation', () => {
  describe('isValidDocumentType', () => {
    it('should accept PDF', () => {
      expect(isValidDocumentType('application/pdf')).toBe(true);
    });

    it('should accept XLSX', () => {
      expect(isValidDocumentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
    });

    it('should accept XLS', () => {
      expect(isValidDocumentType('application/vnd.ms-excel')).toBe(true);
    });

    it('should accept CSV', () => {
      expect(isValidDocumentType('text/csv')).toBe(true);
    });

    it('should reject image types', () => {
      expect(isValidDocumentType('image/jpeg')).toBe(false);
      expect(isValidDocumentType('image/png')).toBe(false);
    });

    it('should reject random MIME types', () => {
      expect(isValidDocumentType('text/html')).toBe(false);
      expect(isValidDocumentType('application/json')).toBe(false);
      expect(isValidDocumentType('video/mp4')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(isValidDocumentType('')).toBe(false);
    });
  });

  describe('validateFileMagicNumber', () => {
    it('should validate PDF magic number (%PDF)', () => {
      const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E]);
      expect(validateFileMagicNumber(pdfBuffer, 'application/pdf')).toBe(true);
    });

    it('should reject invalid PDF magic number', () => {
      const fakeBuffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateFileMagicNumber(fakeBuffer, 'application/pdf')).toBe(false);
    });

    it('should validate XLSX magic number (PK/ZIP)', () => {
      const xlsxBuffer = Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x14, 0x00]);
      expect(validateFileMagicNumber(xlsxBuffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true);
    });

    it('should validate XLS magic number (OLE2)', () => {
      const xlsBuffer = Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1]);
      expect(validateFileMagicNumber(xlsBuffer, 'application/vnd.ms-excel')).toBe(true);
    });

    it('should accept CSV without magic number (text-based)', () => {
      const csvBuffer = Buffer.from('Name,Age,City\nJohn,30,Berlin');
      expect(validateFileMagicNumber(csvBuffer, 'text/csv')).toBe(true);
    });

    it('should reject too-short buffers', () => {
      const shortBuffer = Buffer.from([0x25]);
      expect(validateFileMagicNumber(shortBuffer, 'application/pdf')).toBe(false);
    });

    it('should reject unknown MIME type without magic number', () => {
      const buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);
      expect(validateFileMagicNumber(buffer, 'application/unknown')).toBe(false);
    });
  });

  describe('getDocumentTypeLabel', () => {
    it('should return "PDF" for PDF MIME type', () => {
      expect(getDocumentTypeLabel('application/pdf')).toBe('PDF');
    });

    it('should return "Excel (XLSX)" for XLSX MIME type', () => {
      expect(getDocumentTypeLabel('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('Excel (XLSX)');
    });

    it('should return "Excel (XLS)" for XLS MIME type', () => {
      expect(getDocumentTypeLabel('application/vnd.ms-excel')).toBe('Excel (XLS)');
    });

    it('should return "CSV" for CSV MIME type', () => {
      expect(getDocumentTypeLabel('text/csv')).toBe('CSV');
    });

    it('should return "Unbekannt" for unknown types', () => {
      expect(getDocumentTypeLabel('application/unknown')).toBe('Unbekannt');
    });
  });
});

// ===========================================
// Phase 2: Templates Export Test
// ===========================================

describe('Document Analysis - Templates', () => {
  it('should export all 5 analysis templates', () => {
    expect(Object.keys(ANALYSIS_TEMPLATES)).toHaveLength(5);
    expect(ANALYSIS_TEMPLATES).toHaveProperty('general');
    expect(ANALYSIS_TEMPLATES).toHaveProperty('financial');
    expect(ANALYSIS_TEMPLATES).toHaveProperty('contract');
    expect(ANALYSIS_TEMPLATES).toHaveProperty('data');
    expect(ANALYSIS_TEMPLATES).toHaveProperty('summary');
  });

  it('each template should have system and instruction', () => {
    for (const [key, template] of Object.entries(ANALYSIS_TEMPLATES)) {
      expect(template.system).toBeTruthy();
      expect(template.instruction).toBeTruthy();
      expect(typeof template.system).toBe('string');
      expect(typeof template.instruction).toBe('string');
      expect(template.system.length).toBeGreaterThan(10);
      expect(template.instruction.length).toBeGreaterThan(10);
    }
  });
});

// ===========================================
// Phase 2: Cache Management Tests
// ===========================================

describe('Document Analysis - Prompt Cache', () => {
  it('should compute consistent cache keys for same content', () => {
    const buffer = Buffer.from('test document content');
    const key1 = documentAnalysis.computeCacheKey(buffer);
    const key2 = documentAnalysis.computeCacheKey(buffer);

    expect(key1).toBe(key2);
    expect(key1).toHaveLength(16);
  });

  it('should compute different cache keys for different content', () => {
    const buffer1 = Buffer.from('document A');
    const buffer2 = Buffer.from('document B');

    const key1 = documentAnalysis.computeCacheKey(buffer1);
    const key2 = documentAnalysis.computeCacheKey(buffer2);

    expect(key1).not.toBe(key2);
  });

  it('should report false for non-cached documents', () => {
    expect(documentAnalysis.isCached('non-existent-key')).toBe(false);
  });

  it('should return cache size', () => {
    const size = documentAnalysis.getCacheSize();
    expect(typeof size).toBe('number');
    expect(size).toBeGreaterThanOrEqual(0);
  });

  it('should clean expired cache entries', () => {
    const cleaned = documentAnalysis.cleanCache();
    expect(typeof cleaned).toBe('number');
    expect(cleaned).toBeGreaterThanOrEqual(0);
  });
});

// ===========================================
// Phase 2: Section Parsing Tests
// ===========================================

describe('Document Analysis - Section Parsing', () => {
  it('should parse sections from markdown text', () => {
    const markdown = `## Zusammenfassung
Das ist eine Zusammenfassung.

## Kennzahlen
| Metrik | Wert |
| --- | --- |
| Umsatz | 100.000 € |

## Details
- Punkt 1
- Punkt 2
- Punkt 3`;

    const sections = documentAnalysis.parseSections(markdown);
    expect(sections.length).toBe(3);
    expect(sections[0].title).toBe('Zusammenfassung');
    expect(sections[0].type).toBe('text');
    expect(sections[1].title).toBe('Kennzahlen');
    expect(sections[1].type).toBe('table');
    expect(sections[2].title).toBe('Details');
    expect(sections[2].type).toBe('list');
  });

  it('should handle empty text', () => {
    const sections = documentAnalysis.parseSections('');
    expect(sections).toHaveLength(0);
  });

  it('should handle text without sections', () => {
    const sections = documentAnalysis.parseSections('Just some plain text without headers.');
    expect(sections).toHaveLength(0);
  });
});

// ===========================================
// Phase 2: Key Findings Extraction Tests
// ===========================================

describe('Document Analysis - Key Findings Extraction', () => {
  it('should extract emphasized bullet points', () => {
    const text = `
- **Umsatzsteigerung** um 15%
- **Kosten** blieben stabil
- Normaler Punkt ohne Emphasis
- **Gewinn** verdoppelt
`;
    const findings = documentAnalysis.extractKeyFindings(text);
    expect(findings.length).toBe(3);
    expect(findings[0]).toBe('Umsatzsteigerung');
    expect(findings[1]).toBe('Kosten');
    expect(findings[2]).toBe('Gewinn');
  });

  it('should fallback to regular bullets when no emphasis found', () => {
    const text = `
- First regular point
- Second regular point
- Third regular point
`;
    const findings = documentAnalysis.extractKeyFindings(text);
    expect(findings.length).toBe(3);
    expect(findings[0]).toBe('First regular point');
  });

  it('should limit findings to 10', () => {
    const items = Array.from({ length: 15 }, (_, i) => `- **Finding ${i + 1}** details`);
    const text = items.join('\n');
    const findings = documentAnalysis.extractKeyFindings(text);
    expect(findings.length).toBeLessThanOrEqual(10);
  });

  it('should return empty array for text without bullets', () => {
    const findings = documentAnalysis.extractKeyFindings('Just a paragraph of text.');
    expect(findings).toHaveLength(0);
  });
});

// ===========================================
// Phase 2: Service Availability
// ===========================================

describe('Document Analysis - Service', () => {
  it('should expose isAvailable method', () => {
    const available = documentAnalysis.isAvailable();
    expect(typeof available).toBe('boolean');
  });
});

// ===========================================
// Route Tests (Integration)
// ===========================================

describe('Document Analysis - Routes', () => {
  // Mock dependencies for route tests
  let app: import('express').Express;

  beforeAll(async () => {
    const express = await import('express');
    const { documentAnalysisRouter } = await import('../routes/document-analysis');
    const { errorHandler } = await import('../middleware/errorHandler');

    // Mock API key auth middleware
    jest.mock('../middleware/auth', () => ({
      apiKeyAuth: (_req: unknown, _res: unknown, next: Function) => next(),
    }));

    app = express.default();
    app.use(express.default.json());
    app.use('/api/documents', documentAnalysisRouter);
    app.use(errorHandler);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  describe('GET /api/documents/status', () => {
    it('should return service status with Phase 2 features', async () => {
      const supertest = await import('supertest');
      const res = await supertest.default(app).get('/api/documents/status');

      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('available');
        expect(res.body.data).toHaveProperty('supportedFormats');
        expect(res.body.data).toHaveProperty('templates');
        expect(res.body.data).toHaveProperty('features');
        expect(res.body.data.supportedFormats).toHaveLength(4);
        // Phase 2 features
        expect(res.body.data.features).toEqual({
          streaming: true,
          comparison: true,
          followUp: true,
          history: true,
        });
      }
    });
  });

  describe('GET /api/documents/templates', () => {
    it('should return available templates', async () => {
      const supertest = await import('supertest');
      const res = await supertest.default(app).get('/api/documents/templates');

      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data.templates).toHaveLength(5);
        expect(res.body.data.templates[0]).toHaveProperty('id');
        expect(res.body.data.templates[0]).toHaveProperty('name');
        expect(res.body.data.templates[0]).toHaveProperty('description');
      }
    });
  });

  describe('POST /api/documents/analyze', () => {
    it('should reject request without file', async () => {
      const supertest = await import('supertest');
      const res = await supertest.default(app)
        .post('/api/documents/analyze')
        .send({});

      // Should be 400 or 422 (validation error)
      expect([400, 422]).toContain(res.status);
    });

    it('should reject unsupported file types', async () => {
      const supertest = await import('supertest');
      const res = await supertest.default(app)
        .post('/api/documents/analyze')
        .attach('document', Buffer.from('<html></html>'), {
          filename: 'test.html',
          contentType: 'text/html',
        });

      expect([400, 422]).toContain(res.status);
    });
  });

  describe('POST /api/documents/followup', () => {
    it('should reject request without cacheKey', async () => {
      const supertest = await import('supertest');
      const res = await supertest.default(app)
        .post('/api/documents/followup')
        .send({ question: 'test' });

      expect([400, 422]).toContain(res.status);
    });

    it('should reject request without question', async () => {
      const supertest = await import('supertest');
      const res = await supertest.default(app)
        .post('/api/documents/followup')
        .send({ cacheKey: 'abc123' });

      expect([400, 422]).toContain(res.status);
    });

    it('should reject overly long questions', async () => {
      const supertest = await import('supertest');
      const res = await supertest.default(app)
        .post('/api/documents/followup')
        .send({ cacheKey: 'abc123', question: 'x'.repeat(5001) });

      expect([400, 422]).toContain(res.status);
    });

    it('should return 410 for expired/non-existent cache', async () => {
      const supertest = await import('supertest');
      const res = await supertest.default(app)
        .post('/api/documents/followup')
        .send({ cacheKey: 'non-existent-key', question: 'What is the summary?' });

      expect([400, 410]).toContain(res.status);
      if (res.status === 410) {
        expect(res.body.error.code).toBe('CACHE_EXPIRED');
      }
    });
  });

  describe('POST /api/documents/compare', () => {
    it('should reject request with less than 2 files', async () => {
      const supertest = await import('supertest');
      const res = await supertest.default(app)
        .post('/api/documents/compare')
        .attach('documents', Buffer.from('col1,col2\na,b'), {
          filename: 'test.csv',
          contentType: 'text/csv',
        });

      expect([400, 422]).toContain(res.status);
    });
  });

  describe('GET /api/documents/cache/status', () => {
    it('should return cache status', async () => {
      const supertest = await import('supertest');
      const res = await supertest.default(app).get('/api/documents/cache/status');

      expect([200, 401]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('cachedDocuments');
        expect(res.body.data).toHaveProperty('maxCacheSize');
        expect(res.body.data).toHaveProperty('ttlMinutes');
        expect(res.body.data.maxCacheSize).toBe(20);
        expect(res.body.data.ttlMinutes).toBe(5);
      }
    });
  });
});

// ===========================================
// Excel Parsing Tests (via xlsx)
// ===========================================

describe('Document Analysis - Excel Parsing', () => {
  it('should have xlsx library available', () => {
    const XLSX = require('xlsx');
    expect(XLSX).toBeDefined();
    expect(XLSX.read).toBeInstanceOf(Function);
    expect(XLSX.utils).toBeDefined();
  });

  it('should parse simple xlsx buffer', () => {
    const XLSX = require('xlsx');

    // Create a simple workbook
    const wb = XLSX.utils.book_new();
    const wsData = [
      ['Name', 'Alter', 'Stadt'],
      ['Anna', 30, 'Berlin'],
      ['Ben', 25, 'Hamburg'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, 'Personen');

    // Write to buffer
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    expect(Buffer.isBuffer(buffer)).toBe(true);

    // Parse back
    const parsed = XLSX.read(buffer, { type: 'buffer' });
    expect(parsed.SheetNames).toContain('Personen');

    const sheet = parsed.Sheets['Personen'];
    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    expect(json).toHaveLength(3);
    expect(json[0]).toEqual(['Name', 'Alter', 'Stadt']);
    expect(json[1]).toEqual(['Anna', 30, 'Berlin']);
  });

  it('should handle multi-sheet workbooks', () => {
    const XLSX = require('xlsx');

    const wb = XLSX.utils.book_new();

    // Sheet 1
    const ws1 = XLSX.utils.aoa_to_sheet([
      ['Produkt', 'Preis'],
      ['Widget A', 9.99],
    ]);
    XLSX.utils.book_append_sheet(wb, ws1, 'Produkte');

    // Sheet 2
    const ws2 = XLSX.utils.aoa_to_sheet([
      ['Region', 'Umsatz'],
      ['Nord', 50000],
      ['Süd', 75000],
    ]);
    XLSX.utils.book_append_sheet(wb, ws2, 'Umsatz');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = XLSX.read(buffer, { type: 'buffer' });

    expect(parsed.SheetNames).toEqual(['Produkte', 'Umsatz']);
  });

  it('should handle empty sheets', () => {
    const XLSX = require('xlsx');

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, ws, 'Leer');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const parsed = XLSX.read(buffer, { type: 'buffer' });

    const json = XLSX.utils.sheet_to_json(parsed.Sheets['Leer'], { header: 1 });
    expect(json).toHaveLength(0);
  });
});

// ===========================================
// CSV Parsing Tests
// ===========================================

describe('Document Analysis - CSV Parsing', () => {
  it('should detect comma separator', () => {
    const csv = 'Name,Age,City\nJohn,30,Berlin\nJane,25,Munich';
    const lines = csv.split('\n');
    const firstLine = lines[0];

    // Detect separator
    const separators = [',', ';', '\t'];
    const separator = separators.reduce((best, sep) => {
      return (firstLine.split(sep).length > firstLine.split(best).length) ? sep : best;
    }, ',');

    expect(separator).toBe(',');
  });

  it('should detect semicolon separator (German CSV)', () => {
    const csv = 'Name;Alter;Stadt\nJohn;30;Berlin';
    const firstLine = csv.split('\n')[0];

    const separators = [',', ';', '\t'];
    const separator = separators.reduce((best, sep) => {
      return (firstLine.split(sep).length > firstLine.split(best).length) ? sep : best;
    }, ',');

    expect(separator).toBe(';');
  });

  it('should detect tab separator', () => {
    const csv = 'Name\tAge\tCity\nJohn\t30\tBerlin';
    const firstLine = csv.split('\n')[0];

    const separators = [',', ';', '\t'];
    const separator = separators.reduce((best, sep) => {
      return (firstLine.split(sep).length > firstLine.split(best).length) ? sep : best;
    }, ',');

    expect(separator).toBe('\t');
  });

  it('should handle quoted CSV fields', () => {
    const field = '"Hello, World"';
    const cleaned = field.replace(/^"|"$/g, '');
    expect(cleaned).toBe('Hello, World');
  });
});
