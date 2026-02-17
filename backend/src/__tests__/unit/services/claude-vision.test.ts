/**
 * Unit Tests for Claude Vision Service
 *
 * Tests image analysis capabilities including:
 * - Image description and analysis
 * - Text extraction (OCR)
 * - Idea extraction from visual content
 * - Image Q&A
 * - Multi-image comparison
 *
 * @module tests/services/claude-vision
 */

import {
  VisionImage,
  VisionTask,
  VisionOptions,
  bufferToVisionImage,
  isValidImageFormat,
  getMimeTypeFromFilename,
  ImageMediaType,
} from '../../../services/claude-vision';

// Mock the Claude client and dependencies
jest.mock('../../../services/claude/client', () => ({
  getClaudeClient: jest.fn().mockReturnValue({
    messages: {
      create: jest.fn(),
    },
  }),
  executeWithProtection: jest.fn((fn) => fn()),
  CLAUDE_MODEL: 'claude-sonnet-4-20250514',
}));

jest.mock('../../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Import after mocks are set up
import { claudeVision } from '../../../services/claude-vision';
import { getClaudeClient, executeWithProtection } from '../../../services/claude/client';

describe('Claude Vision Service', () => {
  // Sample test image (1x1 red PNG in base64)
  const sampleImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';

  const createTestImage = (mediaType: ImageMediaType = 'image/png'): VisionImage => ({
    base64: sampleImageBase64,
    mediaType,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup default mock response
    const mockClient = getClaudeClient() as jest.Mocked<any>;
    mockClient.messages.create.mockResolvedValue({
      content: [{ type: 'text', text: 'Test response from Claude Vision' }],
    });
  });

  // ===========================================
  // Utility Function Tests
  // ===========================================

  describe('bufferToVisionImage', () => {
    it('should convert buffer to VisionImage', () => {
      const buffer = Buffer.from('test image data');
      const result = bufferToVisionImage(buffer, 'image/jpeg');

      expect(result).toHaveProperty('base64');
      expect(result).toHaveProperty('mediaType');
      expect(result.mediaType).toBe('image/jpeg');
      expect(result.base64).toBe(buffer.toString('base64'));
    });

    it('should work with different media types', () => {
      const buffer = Buffer.from('test');
      const types: ImageMediaType[] = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

      types.forEach(type => {
        const result = bufferToVisionImage(buffer, type);
        expect(result.mediaType).toBe(type);
      });
    });
  });

  describe('isValidImageFormat', () => {
    it('should return true for valid image formats', () => {
      expect(isValidImageFormat('image/jpeg')).toBe(true);
      expect(isValidImageFormat('image/png')).toBe(true);
      expect(isValidImageFormat('image/gif')).toBe(true);
      expect(isValidImageFormat('image/webp')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidImageFormat('image/svg+xml')).toBe(false);
      expect(isValidImageFormat('image/bmp')).toBe(false);
      expect(isValidImageFormat('application/pdf')).toBe(false);
      expect(isValidImageFormat('text/plain')).toBe(false);
      expect(isValidImageFormat('')).toBe(false);
    });
  });

  describe('getMimeTypeFromFilename', () => {
    it('should return correct mime type for known extensions', () => {
      expect(getMimeTypeFromFilename('photo.jpg')).toBe('image/jpeg');
      expect(getMimeTypeFromFilename('photo.jpeg')).toBe('image/jpeg');
      expect(getMimeTypeFromFilename('image.png')).toBe('image/png');
      expect(getMimeTypeFromFilename('animated.gif')).toBe('image/gif');
      expect(getMimeTypeFromFilename('modern.webp')).toBe('image/webp');
    });

    it('should be case-insensitive', () => {
      expect(getMimeTypeFromFilename('PHOTO.JPG')).toBe('image/jpeg');
      expect(getMimeTypeFromFilename('IMAGE.PNG')).toBe('image/png');
      expect(getMimeTypeFromFilename('file.GIF')).toBe('image/gif');
    });

    it('should return null for unknown extensions', () => {
      expect(getMimeTypeFromFilename('document.pdf')).toBeNull();
      expect(getMimeTypeFromFilename('file.bmp')).toBeNull();
      expect(getMimeTypeFromFilename('image.svg')).toBeNull();
      expect(getMimeTypeFromFilename('noextension')).toBeNull();
    });
  });

  // ===========================================
  // Service Availability Tests
  // ===========================================

  describe('isAvailable', () => {
    it('should return true when Claude client is available', () => {
      expect(claudeVision.isAvailable()).toBe(true);
    });

    it('should return false when client throws', () => {
      (getClaudeClient as jest.Mock).mockImplementationOnce(() => {
        throw new Error('API key not configured');
      });

      expect(claudeVision.isAvailable()).toBe(false);
    });
  });

  // ===========================================
  // Analyze Method Tests
  // ===========================================

  describe('analyze', () => {
    it('should analyze a single image with default options', async () => {
      const image = createTestImage();
      const result = await claudeVision.analyze(image, 'describe');

      expect(result.success).toBe(true);
      expect(result.task).toBe('describe');
      expect(result.text).toBeDefined();
      expect(result.metadata.imageCount).toBe(1);
      expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should analyze multiple images', async () => {
      const images = [createTestImage(), createTestImage()];
      const result = await claudeVision.analyze(images, 'compare');

      expect(result.success).toBe(true);
      expect(result.metadata.imageCount).toBe(2);
    });

    it('should support all vision tasks', async () => {
      const tasks: VisionTask[] = [
        'describe',
        'extract_text',
        'analyze',
        'extract_ideas',
        'summarize',
        'compare',
        'qa',
      ];

      for (const task of tasks) {
        const result = await claudeVision.analyze(createTestImage(), task);
        expect(result.task).toBe(task);
      }
    });

    it('should pass custom options to Claude', async () => {
      const image = createTestImage();
      const options: VisionOptions = {
        maxTokens: 500,
        context: 'This is a screenshot of a dashboard',
        language: 'en',
        temperature: 0.5,
      };

      await claudeVision.analyze(image, 'analyze', options);

      const mockClient = getClaudeClient() as jest.Mocked<any>;
      const callArgs = mockClient.messages.create.mock.calls[0][0];

      expect(callArgs.max_tokens).toBe(500);
      expect(callArgs.temperature).toBe(0.5);
    });

    it('should handle API errors gracefully', async () => {
      const mockClient = getClaudeClient() as jest.Mocked<any>;
      mockClient.messages.create.mockRejectedValueOnce(new Error('API error'));

      const result = await claudeVision.analyze(createTestImage(), 'describe');

      expect(result.success).toBe(false);
      expect(result.text).toBe('');
    });

    it('should parse structured output for extract_text task', async () => {
      const mockClient = getClaudeClient() as jest.Mocked<any>;
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: '{"extractedText": "Hello World", "confidence": 0.95}',
        }],
      });

      const result = await claudeVision.analyze(createTestImage(), 'extract_text');

      expect(result.success).toBe(true);
      expect(result.structured?.extractedText).toBe('Hello World');
      expect(result.structured?.confidence).toBe(0.95);
    });

    it('should parse structured output for extract_ideas task', async () => {
      const mockClient = getClaudeClient() as jest.Mocked<any>;
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: '{"ideas": [{"title": "Idea 1", "type": "task", "description": "Test idea"}]}',
        }],
      });

      const result = await claudeVision.analyze(createTestImage(), 'extract_ideas');

      expect(result.success).toBe(true);
      expect(result.structured?.ideas).toHaveLength(1);
      expect(result.structured?.ideas?.[0].title).toBe('Idea 1');
    });
  });

  // ===========================================
  // Convenience Method Tests
  // ===========================================

  describe('describe', () => {
    it('should return image description as string', async () => {
      const mockClient = getClaudeClient() as jest.Mocked<any>;
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'A beautiful sunset over mountains' }],
      });

      const result = await claudeVision.describe(createTestImage());

      expect(typeof result).toBe('string');
      expect(result).toBe('A beautiful sunset over mountains');
    });
  });

  describe('extractText', () => {
    it('should return extracted text and confidence', async () => {
      const mockClient = getClaudeClient() as jest.Mocked<any>;
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: '{"extractedText": "Lorem ipsum dolor sit amet", "confidence": 0.92}',
        }],
      });

      const result = await claudeVision.extractText(createTestImage());

      expect(result.text).toBe('Lorem ipsum dolor sit amet');
      expect(result.confidence).toBe(0.92);
    });

    it('should fallback to raw text if parsing fails', async () => {
      const mockClient = getClaudeClient() as jest.Mocked<any>;
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Plain text response without JSON' }],
      });

      const result = await claudeVision.extractText(createTestImage());

      expect(result.text).toBe('Plain text response without JSON');
      expect(result.confidence).toBe(0.8); // Default confidence
    });
  });

  describe('extractIdeas', () => {
    it('should return array of extracted ideas', async () => {
      const mockClient = getClaudeClient() as jest.Mocked<any>;
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            ideas: [
              { title: 'Idea 1', type: 'task', description: 'First idea' },
              { title: 'Idea 2', type: 'insight', description: 'Second idea' },
            ],
          }),
        }],
      });

      const result = await claudeVision.extractIdeas(createTestImage(), 'work');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      expect(result[0].title).toBe('Idea 1');
    });

    it('should return empty array if no ideas found', async () => {
      const mockClient = getClaudeClient() as jest.Mocked<any>;
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'No ideas could be extracted.' }],
      });

      const result = await claudeVision.extractIdeas(createTestImage(), 'personal');

      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });

  describe('askAboutImage', () => {
    it('should answer questions about the image', async () => {
      const mockClient = getClaudeClient() as jest.Mocked<any>;
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{ type: 'text', text: 'The image shows 3 people in the photo.' }],
      });

      const result = await claudeVision.askAboutImage(
        createTestImage(),
        'How many people are in this image?'
      );

      expect(result).toContain('3 people');
    });
  });

  describe('compare', () => {
    it('should compare multiple images', async () => {
      const mockClient = getClaudeClient() as jest.Mocked<any>;
      mockClient.messages.create.mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: 'Image 1 shows a cat, Image 2 shows a dog. Both are animals.',
        }],
      });

      const images = [createTestImage(), createTestImage()];
      const result = await claudeVision.compare(images);

      expect(result.success).toBe(true);
      expect(result.metadata.imageCount).toBe(2);
    });

    it('should throw error if less than 2 images', async () => {
      await expect(
        claudeVision.compare([createTestImage()])
      ).rejects.toThrow('At least 2 images required');
    });
  });

  describe('processDocument', () => {
    it('should extract text, summary, and ideas from document', async () => {
      const mockClient = getClaudeClient() as jest.Mocked<any>;

      // Mock responses for text extraction, idea extraction, and summary
      mockClient.messages.create
        .mockResolvedValueOnce({
          content: [{
            type: 'text',
            text: '{"extractedText": "Document content here"}',
          }],
        })
        .mockResolvedValueOnce({
          content: [{
            type: 'text',
            text: '{"ideas": [{"title": "Action item", "type": "task", "description": "Follow up"}]}',
          }],
        })
        .mockResolvedValueOnce({
          content: [{
            type: 'text',
            text: 'This document discusses project requirements.',
          }],
        });

      const result = await claudeVision.processDocument(createTestImage());

      expect(result.text).toBeDefined();
      expect(result.summary).toBeDefined();
      expect(Array.isArray(result.ideas)).toBe(true);
    });
  });

  // ===========================================
  // Language Support Tests
  // ===========================================

  describe('Language options', () => {
    it('should default to German language', async () => {
      await claudeVision.describe(createTestImage());

      const mockClient = getClaudeClient() as jest.Mocked<any>;
      const systemPrompt = mockClient.messages.create.mock.calls[0][0].system;

      // German system prompt should not contain "Respond in English"
      expect(systemPrompt).not.toContain('Respond in English');
    });

    it('should support English language option', async () => {
      await claudeVision.describe(createTestImage(), { language: 'en' });

      const mockClient = getClaudeClient() as jest.Mocked<any>;
      const systemPrompt = mockClient.messages.create.mock.calls[0][0].system;

      // With i18n prompts, English uses native English system prompt
      expect(systemPrompt).toContain('image description');
      expect(systemPrompt).not.toContain('Bildbeschreibung');
    });
  });

  // ===========================================
  // Context Integration Tests
  // ===========================================

  describe('Context integration', () => {
    it('should include context in the prompt when provided', async () => {
      await claudeVision.analyze(createTestImage(), 'analyze', {
        context: 'This is a screenshot of our quarterly sales dashboard',
      });

      const mockClient = getClaudeClient() as jest.Mocked<any>;
      const messages = mockClient.messages.create.mock.calls[0][0].messages;
      const userContent = messages[0].content;

      // Find the text content that should contain the context
      const textContent = userContent.find((c: any) => c.type === 'text');
      expect(textContent?.text).toContain('KONTEXT');
      expect(textContent?.text).toContain('quarterly sales dashboard');
    });
  });
});
