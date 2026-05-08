import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../../middleware/errorHandler';

jest.mock('../../../middleware/auth', () => ({
  apiKeyAuth: (_req: any, _res: any, next: any) => next(),
  requireScope: () => (_req: any, _res: any, next: any) => next(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockGet = jest.fn();
jest.mock('../../../services/documents/document-store', () => ({
  documentStore: {
    get: (...args: any[]) => mockGet(...args),
  },
}));

import { documentDownloadRouter } from '../../../routes/document-downloads';

describe('GET /api/documents/:id/download', () => {
  let app: express.Express;

  beforeAll(() => {
    app = express();
    app.use('/api', documentDownloadRouter);
    app.use(errorHandler);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 200 with binary file for valid document ID', async () => {
    const buf = Buffer.from('fake-pptx-content');
    mockGet.mockReturnValue({
      id: 'abc-123',
      type: 'pptx',
      title: 'Q4 Report',
      buffer: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extension: 'pptx',
      pageCount: 5,
      fileSize: buf.length,
      createdAt: new Date(),
    });

    const res = await request(app).get('/api/documents/abc-123/download');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('presentation');
    expect(res.headers['content-disposition']).toContain('Q4 Report.pptx');
    expect(mockGet).toHaveBeenCalledWith('abc-123');
  });

  it('returns 404 for unknown document ID', async () => {
    mockGet.mockReturnValue(null);
    const res = await request(app).get('/api/documents/nonexistent/download');
    expect(res.status).toBe(404);
  });

  it('sets correct Content-Disposition for PDF with umlauts', async () => {
    const buf = Buffer.from('fake-pdf');
    mockGet.mockReturnValue({
      id: 'pdf-1',
      type: 'pdf',
      title: 'Übersicht März',
      buffer: buf,
      mimeType: 'application/pdf',
      extension: 'pdf',
      pageCount: 2,
      fileSize: buf.length,
      createdAt: new Date(),
    });

    const res = await request(app).get('/api/documents/pdf-1/download');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect(res.headers['content-disposition']).toContain('filename=');
    expect(res.headers['content-disposition']).toContain("filename*=UTF-8''");
  });

  it('sets correct Content-Disposition for DOCX', async () => {
    const buf = Buffer.from('fake-docx');
    mockGet.mockReturnValue({
      id: 'docx-1',
      type: 'docx',
      title: 'Meeting Notes',
      buffer: buf,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
      pageCount: 3,
      fileSize: buf.length,
      createdAt: new Date(),
    });

    const res = await request(app).get('/api/documents/docx-1/download');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toContain('Meeting Notes.docx');
  });
});
