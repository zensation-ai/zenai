import { documentStore } from '../../../../services/documents/document-store';

describe('documentStore', () => {
  beforeEach(() => {
    documentStore.clear();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores and retrieves a document by ID', () => {
    const doc = {
      id: 'test-id-1',
      type: 'pptx' as const,
      title: 'Test Deck',
      buffer: Buffer.from('fake-pptx'),
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      extension: 'pptx',
      pageCount: 3,
      fileSize: 9,
      createdAt: new Date(),
    };
    documentStore.set(doc.id, doc);
    const retrieved = documentStore.get('test-id-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved!.title).toBe('Test Deck');
    expect(retrieved!.buffer).toBeInstanceOf(Buffer);
  });

  it('returns null for unknown ID', () => {
    expect(documentStore.get('nonexistent')).toBeNull();
  });

  it('deletes a document', () => {
    const doc = {
      id: 'del-1',
      type: 'pdf' as const,
      title: 'Delete Me',
      buffer: Buffer.from('pdf'),
      mimeType: 'application/pdf',
      extension: 'pdf',
      pageCount: 1,
      fileSize: 3,
      createdAt: new Date(),
    };
    documentStore.set(doc.id, doc);
    expect(documentStore.get('del-1')).not.toBeNull();
    documentStore.delete('del-1');
    expect(documentStore.get('del-1')).toBeNull();
  });

  it('clear removes all documents', () => {
    documentStore.set('a', { id: 'a', type: 'pdf' as const, title: 'A', buffer: Buffer.from('a'), mimeType: 'application/pdf', extension: 'pdf', pageCount: 1, fileSize: 1, createdAt: new Date() });
    documentStore.set('b', { id: 'b', type: 'pdf' as const, title: 'B', buffer: Buffer.from('b'), mimeType: 'application/pdf', extension: 'pdf', pageCount: 1, fileSize: 1, createdAt: new Date() });
    documentStore.clear();
    expect(documentStore.get('a')).toBeNull();
    expect(documentStore.get('b')).toBeNull();
  });

  it('expires documents older than TTL (1 hour)', () => {
    jest.useFakeTimers();
    const doc = {
      id: 'expire-1',
      type: 'docx' as const,
      title: 'Expiring',
      buffer: Buffer.from('docx'),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      extension: 'docx',
      pageCount: 1,
      fileSize: 4,
      createdAt: new Date(),
    };
    documentStore.set(doc.id, doc);
    expect(documentStore.get('expire-1')).not.toBeNull();
    jest.advanceTimersByTime(61 * 60 * 1000);
    expect(documentStore.get('expire-1')).toBeNull();
  });

  it('evicts oldest entry when max capacity (50) is reached', () => {
    for (let i = 0; i < 50; i++) {
      documentStore.set(`doc-${i}`, {
        id: `doc-${i}`,
        type: 'pdf' as const,
        title: `Doc ${i}`,
        buffer: Buffer.from('x'),
        mimeType: 'application/pdf',
        extension: 'pdf',
        pageCount: 1,
        fileSize: 1,
        createdAt: new Date(),
      });
    }
    expect(documentStore.get('doc-0')).not.toBeNull();
    documentStore.set('doc-50', {
      id: 'doc-50',
      type: 'pdf' as const,
      title: 'Doc 50',
      buffer: Buffer.from('x'),
      mimeType: 'application/pdf',
      extension: 'pdf',
      pageCount: 1,
      fileSize: 1,
      createdAt: new Date(),
    });
    expect(documentStore.get('doc-0')).toBeNull();
    expect(documentStore.get('doc-50')).not.toBeNull();
  });
});
