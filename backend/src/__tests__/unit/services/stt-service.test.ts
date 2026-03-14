/**
 * STT Service Tests
 * Phase 57: Real-Time Voice Pipeline
 */

jest.mock('../../../services/openai', () => ({
  transcribeWithOpenAI: jest.fn(),
  isOpenAIAvailable: jest.fn(),
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

import { STTService } from '../../../services/voice/stt-service';
import { transcribeWithOpenAI, isOpenAIAvailable } from '../../../services/openai';

const mockTranscribe = transcribeWithOpenAI as jest.MockedFunction<typeof transcribeWithOpenAI>;
const mockIsAvailable = isOpenAIAvailable as jest.MockedFunction<typeof isOpenAIAvailable>;

describe('STTService', () => {
  let service: STTService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAvailable.mockReturnValue(true);
    service = new STTService();
  });

  describe('constructor', () => {
    it('should initialize with providers', () => {
      expect(service).toBeDefined();
    });

    it('should default to whisper when available', () => {
      mockIsAvailable.mockReturnValue(true);
      const s = new STTService();
      expect(s.getAvailableProviders()).toContain('whisper');
    });
  });

  describe('transcribe', () => {
    it('should transcribe with whisper provider', async () => {
      mockTranscribe.mockResolvedValue({
        text: 'Hallo Welt',
        language: 'de',
        duration: 500,
      });

      const result = await service.transcribe(Buffer.from('test-audio'), {
        language: 'de',
      });

      expect(result.text).toBe('Hallo Welt');
      expect(result.provider).toBe('whisper');
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it('should pass format to whisper provider', async () => {
      mockTranscribe.mockResolvedValue({
        text: 'Test',
        language: 'de',
        duration: 100,
      });

      await service.transcribe(Buffer.from('audio'), { format: 'mp3' });

      expect(mockTranscribe).toHaveBeenCalledWith(
        expect.any(Buffer),
        'audio.mp3'
      );
    });

    it('should fallback when preferred provider fails', async () => {
      mockTranscribe.mockRejectedValueOnce(new Error('Whisper failed'));
      // Deepgram not available (no API key), so it should throw

      await expect(service.transcribe(Buffer.from('audio'))).rejects.toThrow();
    });

    it('should throw when no provider is available', async () => {
      mockIsAvailable.mockReturnValue(false);
      const s = new STTService();

      await expect(s.transcribe(Buffer.from('audio'))).rejects.toThrow('No STT provider available');
    });

    it('should use specified provider', async () => {
      mockTranscribe.mockResolvedValue({
        text: 'Test',
        language: 'de',
        duration: 100,
      });

      const result = await service.transcribe(Buffer.from('audio'), {
        provider: 'whisper',
      });

      expect(result.provider).toBe('whisper');
    });
  });

  describe('getAvailableProviders', () => {
    it('should return available providers', () => {
      mockIsAvailable.mockReturnValue(true);
      const s = new STTService();
      const providers = s.getAvailableProviders();

      expect(providers).toContain('whisper');
      expect(Array.isArray(providers)).toBe(true);
    });

    it('should exclude unavailable providers', () => {
      mockIsAvailable.mockReturnValue(false);
      const s = new STTService();
      const providers = s.getAvailableProviders();

      expect(providers).not.toContain('whisper');
    });
  });

  describe('isAvailable', () => {
    it('should return true when at least one provider is available', () => {
      mockIsAvailable.mockReturnValue(true);
      const s = new STTService();
      expect(s.isAvailable()).toBe(true);
    });

    it('should return false when no providers are available', () => {
      mockIsAvailable.mockReturnValue(false);
      const s = new STTService();
      // Deepgram also not available
      expect(s.isAvailable()).toBe(false);
    });
  });

  describe('language detection', () => {
    it('should pass language option to provider', async () => {
      mockTranscribe.mockResolvedValue({
        text: 'Hello World',
        language: 'en',
        duration: 200,
      });

      const result = await service.transcribe(Buffer.from('audio'), {
        language: 'en',
      });

      expect(result.language).toBe('en');
    });
  });

  describe('empty audio handling', () => {
    it('should handle empty buffer', async () => {
      mockTranscribe.mockResolvedValue({
        text: '',
        language: 'de',
        duration: 0,
      });

      const result = await service.transcribe(Buffer.alloc(0));
      expect(result.text).toBe('');
    });
  });
});
