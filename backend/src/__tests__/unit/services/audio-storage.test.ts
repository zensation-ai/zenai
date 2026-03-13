/**
 * Audio Storage Service Tests
 *
 * Tests upload, signed URL generation, deletion, and MIME type mapping
 * for meeting audio files stored in Supabase Storage.
 */

jest.mock('../../../utils/supabase', () => ({
  supabase: {
    isAvailable: jest.fn(),
    getClient: jest.fn(),
  },
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import {
  isAudioStorageAvailable,
  uploadMeetingAudio,
  getSignedAudioUrl,
  deleteMeetingAudio,
} from '../../../services/audio-storage';
import { supabase } from '../../../utils/supabase';

const mockIsAvailable = supabase.isAvailable as jest.MockedFunction<typeof supabase.isAvailable>;
const mockGetClient = supabase.getClient as jest.MockedFunction<typeof supabase.getClient>;

// Helper: build a mock Supabase client with storage API
function createMockClient(overrides?: {
  upload?: { data?: any; error?: any };
  createSignedUrl?: { data?: any; error?: any };
  remove?: { data?: any; error?: any };
}) {
  const upload = jest.fn().mockResolvedValue(overrides?.upload ?? { data: {}, error: null });
  const createSignedUrl = jest.fn().mockResolvedValue(
    overrides?.createSignedUrl ?? { data: { signedUrl: 'https://example.com/signed' }, error: null }
  );
  const remove = jest.fn().mockResolvedValue(overrides?.remove ?? { data: {}, error: null });

  return {
    storage: {
      from: jest.fn().mockReturnValue({ upload, createSignedUrl, remove }),
    },
    _mocks: { upload, createSignedUrl, remove },
  };
}

describe('Audio Storage Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ===========================================
  // isAudioStorageAvailable
  // ===========================================

  describe('isAudioStorageAvailable', () => {
    it('should return true when supabase is available', () => {
      mockIsAvailable.mockReturnValue(true);
      expect(isAudioStorageAvailable()).toBe(true);
    });

    it('should return false when supabase is not available', () => {
      mockIsAvailable.mockReturnValue(false);
      expect(isAudioStorageAvailable()).toBe(false);
    });
  });

  // ===========================================
  // uploadMeetingAudio
  // ===========================================

  describe('uploadMeetingAudio', () => {
    const buffer = Buffer.from('fake-audio-data');
    const meetingId = '123e4567-e89b-12d3-a456-426614174000';
    const mimeType = 'audio/webm';
    const context = 'work';

    it('should upload audio and return result on success', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      const result = await uploadMeetingAudio(buffer, meetingId, mimeType, context);

      expect(result).not.toBeNull();
      expect(result!.storagePath).toMatch(new RegExp(`^${context}/${meetingId}/\\d+\\.webm$`));
      expect(result!.sizeBytes).toBe(buffer.length);
      expect(result!.mimeType).toBe(mimeType);
    });

    it('should call storage.from with correct bucket name', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      await uploadMeetingAudio(buffer, meetingId, mimeType, context);

      expect(mock.storage.from).toHaveBeenCalledWith('meeting-audio');
    });

    it('should pass correct options to upload', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      await uploadMeetingAudio(buffer, meetingId, mimeType, context);

      expect(mock._mocks.upload).toHaveBeenCalledWith(
        expect.any(String),
        buffer,
        { contentType: mimeType, upsert: false }
      );
    });

    it('should return null when supabase client is not available', async () => {
      mockGetClient.mockReturnValue(null);

      const result = await uploadMeetingAudio(buffer, meetingId, mimeType, context);

      expect(result).toBeNull();
    });

    it('should return null when upload fails', async () => {
      const mock = createMockClient({
        upload: { data: null, error: new Error('Upload failed') },
      });
      mockGetClient.mockReturnValue(mock as any);

      const result = await uploadMeetingAudio(buffer, meetingId, mimeType, context);

      expect(result).toBeNull();
    });

    it('should include timestamp in storage path', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);
      const before = Date.now();

      const result = await uploadMeetingAudio(buffer, meetingId, mimeType, context);

      const after = Date.now();
      const pathParts = result!.storagePath.split('/');
      const filename = pathParts[pathParts.length - 1];
      const timestamp = parseInt(filename.split('.')[0], 10);
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should use context as first path segment', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      const result = await uploadMeetingAudio(buffer, meetingId, mimeType, 'personal');

      expect(result!.storagePath).toMatch(/^personal\//);
    });

    it('should use meetingId as second path segment', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      const result = await uploadMeetingAudio(buffer, meetingId, mimeType, context);

      expect(result!.storagePath).toContain(`/${meetingId}/`);
    });
  });

  // ===========================================
  // MIME type to extension mapping
  // ===========================================

  describe('MIME type to extension mapping', () => {
    const buffer = Buffer.from('test');
    const meetingId = 'test-meeting-id';
    const context = 'work';

    const mimeTests: Array<{ mime: string; ext: string }> = [
      { mime: 'audio/webm', ext: 'webm' },
      { mime: 'audio/ogg', ext: 'ogg' },
      { mime: 'audio/mpeg', ext: 'mp3' },
      { mime: 'audio/mp4', ext: 'm4a' },
      { mime: 'audio/x-m4a', ext: 'm4a' },
      { mime: 'audio/wav', ext: 'wav' },
      { mime: 'audio/flac', ext: 'flac' },
    ];

    it.each(mimeTests)('should map $mime to .$ext extension', async ({ mime, ext }) => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      const result = await uploadMeetingAudio(buffer, meetingId, mime, context);

      expect(result!.storagePath).toMatch(new RegExp(`\\.${ext}$`));
    });

    it('should default to .webm for unknown MIME types', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      const result = await uploadMeetingAudio(buffer, meetingId, 'audio/unknown', context);

      expect(result!.storagePath).toMatch(/\.webm$/);
    });
  });

  // ===========================================
  // getSignedAudioUrl
  // ===========================================

  describe('getSignedAudioUrl', () => {
    const storagePath = 'work/meeting-123/1700000000.webm';

    it('should return signed URL on success', async () => {
      const mock = createMockClient({
        createSignedUrl: { data: { signedUrl: 'https://supabase.co/signed/abc' }, error: null },
      });
      mockGetClient.mockReturnValue(mock as any);

      const url = await getSignedAudioUrl(storagePath);

      expect(url).toBe('https://supabase.co/signed/abc');
    });

    it('should call createSignedUrl with correct path and expiry', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      await getSignedAudioUrl(storagePath);

      expect(mock._mocks.createSignedUrl).toHaveBeenCalledWith(storagePath, 3600);
    });

    it('should use meeting-audio bucket', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      await getSignedAudioUrl(storagePath);

      expect(mock.storage.from).toHaveBeenCalledWith('meeting-audio');
    });

    it('should return null when supabase client is not available', async () => {
      mockGetClient.mockReturnValue(null);

      const url = await getSignedAudioUrl(storagePath);

      expect(url).toBeNull();
    });

    it('should return null when createSignedUrl fails', async () => {
      const mock = createMockClient({
        createSignedUrl: { data: null, error: new Error('Signed URL error') },
      });
      mockGetClient.mockReturnValue(mock as any);

      const url = await getSignedAudioUrl(storagePath);

      expect(url).toBeNull();
    });
  });

  // ===========================================
  // deleteMeetingAudio
  // ===========================================

  describe('deleteMeetingAudio', () => {
    const storagePath = 'work/meeting-123/1700000000.webm';

    it('should return true on successful deletion', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      const result = await deleteMeetingAudio(storagePath);

      expect(result).toBe(true);
    });

    it('should call remove with path array', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      await deleteMeetingAudio(storagePath);

      expect(mock._mocks.remove).toHaveBeenCalledWith([storagePath]);
    });

    it('should use meeting-audio bucket', async () => {
      const mock = createMockClient();
      mockGetClient.mockReturnValue(mock as any);

      await deleteMeetingAudio(storagePath);

      expect(mock.storage.from).toHaveBeenCalledWith('meeting-audio');
    });

    it('should return false when supabase client is not available', async () => {
      mockGetClient.mockReturnValue(null);

      const result = await deleteMeetingAudio(storagePath);

      expect(result).toBe(false);
    });

    it('should return false when remove fails', async () => {
      const mock = createMockClient({
        remove: { data: null, error: new Error('Delete failed') },
      });
      mockGetClient.mockReturnValue(mock as any);

      const result = await deleteMeetingAudio(storagePath);

      expect(result).toBe(false);
    });
  });
});
