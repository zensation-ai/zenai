/**
 * Claude Vision Service
 *
 * Professional integration of Claude's vision capabilities for:
 * - Image analysis and description
 * - Document/screenshot understanding
 * - OCR-like text extraction
 * - Visual reasoning and Q&A
 * - Image-based idea extraction
 *
 * @module services/claude-vision
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '../utils/logger';
import { getClaudeClient, executeWithProtection, CLAUDE_MODEL } from './claude/client';
import { AIContext } from '../utils/database-context';

// ===========================================
// Types & Interfaces
// ===========================================

/**
 * Supported image formats
 */
export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';

/**
 * Image input for vision analysis
 */
export interface VisionImage {
  /** Base64 encoded image data */
  base64: string;
  /** MIME type */
  mediaType: ImageMediaType;
}

/**
 * Vision analysis task types
 */
export type VisionTask =
  | 'describe'        // General description
  | 'extract_text'    // OCR-like text extraction
  | 'analyze'         // Detailed analysis
  | 'extract_ideas'   // Extract actionable ideas/tasks
  | 'summarize'       // Summarize visual content
  | 'compare'         // Compare multiple images
  | 'qa';             // Question answering about image

/**
 * Result from vision analysis
 */
export interface VisionResult {
  success: boolean;
  task: VisionTask;
  /** Main text response */
  text: string;
  /** Structured data (if applicable) */
  structured?: {
    /** Extracted text (for extract_text) */
    extractedText?: string;
    /** Detected elements */
    elements?: string[];
    /** Extracted ideas (for extract_ideas) */
    ideas?: Array<{
      title: string;
      type: string;
      description: string;
    }>;
    /** Confidence score */
    confidence?: number;
  };
  /** Processing metadata */
  metadata: {
    imageCount: number;
    processingTimeMs: number;
  };
}

/**
 * Options for vision analysis
 */
export interface VisionOptions {
  /** Maximum tokens for response */
  maxTokens?: number;
  /** Additional context about the image */
  context?: string;
  /** Language for response */
  language?: 'de' | 'en';
  /** Temperature for generation */
  temperature?: number;
}

// ===========================================
// Task-Specific Prompts
// ===========================================

const VISION_PROMPTS: Record<VisionTask, { system: string; instruction: string }> = {
  describe: {
    system: `Du bist ein Experte für Bildbeschreibung. Beschreibe Bilder präzise, strukturiert und vollständig.`,
    instruction: `Beschreibe dieses Bild detailliert:
- Was ist zu sehen (Hauptelemente)?
- Welche Details sind erkennbar?
- Welcher Kontext/Zweck ist erkennbar?`,
  },

  extract_text: {
    system: `Du bist ein OCR-Experte. Extrahiere jeden sichtbaren Text aus Bildern präzise und strukturiert.`,
    instruction: `Extrahiere ALLEN sichtbaren Text aus diesem Bild.

Formatiere die Ausgabe als JSON:
{
  "extractedText": "Der vollständige extrahierte Text",
  "textBlocks": [
    {"position": "oben links", "text": "..."},
    {"position": "mitte", "text": "..."}
  ],
  "confidence": 0.0-1.0
}`,
  },

  analyze: {
    system: `Du bist ein Bildanalytiker. Analysiere Bilder tiefgehend und identifiziere wichtige Muster, Informationen und Bedeutungen.`,
    instruction: `Analysiere dieses Bild gründlich:

1. INHALT: Was zeigt das Bild?
2. KONTEXT: In welchem Zusammenhang steht es?
3. DETAILS: Welche wichtigen Details sind erkennbar?
4. BEDEUTUNG: Welche Informationen/Erkenntnisse kann man ableiten?
5. QUALITÄT: Wie ist die Bildqualität und was fehlt ggf.?`,
  },

  extract_ideas: {
    system: `Du bist ein Ideen-Extraktor. Identifiziere actionable Ideen, Aufgaben und Erkenntnisse aus visuellen Inhalten.`,
    instruction: `Extrahiere alle Ideen, Aufgaben und Erkenntnisse aus diesem Bild.

Antworte als JSON:
{
  "ideas": [
    {
      "title": "Kurzer Titel",
      "type": "idea|task|insight|problem|question",
      "description": "Beschreibung",
      "priority": "low|medium|high"
    }
  ],
  "summary": "Zusammenfassung des visuellen Inhalts"
}`,
  },

  summarize: {
    system: `Du bist ein Zusammenfasser. Fasse visuelle Inhalte prägnant und informativ zusammen.`,
    instruction: `Fasse den Inhalt dieses Bildes in 2-3 Sätzen zusammen. Fokussiere auf die Kernaussage oder Hauptinformation.`,
  },

  compare: {
    system: `Du bist ein Bild-Vergleicher. Vergleiche mehrere Bilder und identifiziere Gemeinsamkeiten und Unterschiede.`,
    instruction: `Vergleiche diese Bilder:

1. GEMEINSAMKEITEN: Was haben sie gemeinsam?
2. UNTERSCHIEDE: Was ist unterschiedlich?
3. ZUSAMMENHANG: Wie hängen sie zusammen?
4. SCHLUSSFOLGERUNG: Was lässt sich daraus ableiten?`,
  },

  qa: {
    system: `Du bist ein visueller Assistent. Beantworte Fragen zu Bildern präzise und hilfreich.`,
    instruction: `Beantworte die Frage basierend auf dem Bildinhalt.`,
  },
};

// ===========================================
// Claude Vision Service Class
// ===========================================

class ClaudeVisionService {
  private client: Anthropic;

  constructor() {
    this.client = getClaudeClient();
  }

  /**
   * Analyze image(s) with a specific task
   */
  async analyze(
    images: VisionImage | VisionImage[],
    task: VisionTask,
    options: VisionOptions = {}
  ): Promise<VisionResult> {
    const imageArray = Array.isArray(images) ? images : [images];
    const {
      maxTokens = 2000,
      context,
      language = 'de',
      temperature = 0.3,
    } = options;

    const startTime = Date.now();

    logger.info('Vision analysis starting', {
      task,
      imageCount: imageArray.length,
      language,
    });

    try {
      const taskConfig = VISION_PROMPTS[task];
      let systemPrompt = taskConfig.system;

      if (language === 'en') {
        systemPrompt += '\n\nRespond in English.';
      }

      // Build content array with images
      const content: Anthropic.MessageCreateParams['messages'][0]['content'] = [];

      for (const image of imageArray) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: image.mediaType,
            data: image.base64,
          },
        });
      }

      // Add instruction
      let instruction = taskConfig.instruction;
      if (context) {
        instruction = `[KONTEXT]\n${context}\n\n${instruction}`;
      }
      content.push({ type: 'text', text: instruction });

      // Make API call
      const response = await executeWithProtection(async () => {
        return this.client.messages.create({
          model: CLAUDE_MODEL,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt,
          messages: [{ role: 'user', content }],
        });
      });

      const text = response.content[0]?.type === 'text'
        ? response.content[0].text
        : '';

      // Parse structured output if applicable
      let structured: VisionResult['structured'];

      if (task === 'extract_text' || task === 'extract_ideas') {
        try {
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            structured = JSON.parse(jsonMatch[0]);
          }
        } catch {
          logger.debug('Failed to parse structured vision output');
        }
      }

      const processingTimeMs = Date.now() - startTime;

      logger.info('Vision analysis complete', {
        task,
        imageCount: imageArray.length,
        processingTimeMs,
      });

      return {
        success: true,
        task,
        text,
        structured,
        metadata: {
          imageCount: imageArray.length,
          processingTimeMs,
        },
      };
    } catch (error) {
      logger.error('Vision analysis failed', error instanceof Error ? error : undefined);

      return {
        success: false,
        task,
        text: '',
        metadata: {
          imageCount: imageArray.length,
          processingTimeMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Quick image description
   */
  async describe(
    image: VisionImage,
    options?: VisionOptions
  ): Promise<string> {
    const result = await this.analyze(image, 'describe', options);
    return result.text;
  }

  /**
   * Extract text from image (OCR)
   */
  async extractText(
    image: VisionImage,
    options?: VisionOptions
  ): Promise<{ text: string; confidence: number }> {
    const result = await this.analyze(image, 'extract_text', options);
    return {
      text: result.structured?.extractedText || result.text,
      confidence: result.structured?.confidence || 0.8,
    };
  }

  /**
   * Extract ideas from visual content (whiteboard, notes, etc.)
   */
  async extractIdeas(
    image: VisionImage,
    context: AIContext,
    options?: VisionOptions
  ): Promise<Array<{
    title: string;
    type: string;
    description: string;
    priority?: string;
  }>> {
    const result = await this.analyze(image, 'extract_ideas', {
      ...options,
      context: `Kontext: ${context}`,
    });

    return result.structured?.ideas || [];
  }

  /**
   * Answer a question about an image
   */
  async askAboutImage(
    image: VisionImage,
    question: string,
    options?: VisionOptions
  ): Promise<string> {
    const result = await this.analyze(image, 'qa', {
      ...options,
      context: `Frage: ${question}`,
    });
    return result.text;
  }

  /**
   * Compare multiple images
   */
  async compare(
    images: VisionImage[],
    options?: VisionOptions
  ): Promise<VisionResult> {
    if (images.length < 2) {
      throw new Error('At least 2 images required for comparison');
    }
    return this.analyze(images, 'compare', options);
  }

  /**
   * Process a document image (screenshot, scan, etc.)
   */
  async processDocument(
    image: VisionImage,
    options?: VisionOptions
  ): Promise<{
    text: string;
    summary: string;
    ideas: Array<{ title: string; type: string; description: string }>;
  }> {
    // Run text extraction and idea extraction in parallel
    const [textResult, ideaResult] = await Promise.all([
      this.analyze(image, 'extract_text', options),
      this.analyze(image, 'extract_ideas', options),
    ]);

    // Get summary
    const summaryResult = await this.analyze(image, 'summarize', options);

    return {
      text: textResult.structured?.extractedText || textResult.text,
      summary: summaryResult.text,
      ideas: ideaResult.structured?.ideas || [],
    };
  }

  /**
   * Check if vision is available
   */
  isAvailable(): boolean {
    try {
      getClaudeClient();
      return true;
    } catch {
      return false;
    }
  }
}

// ===========================================
// Utility Functions
// ===========================================

/**
 * Convert file buffer to VisionImage
 */
export function bufferToVisionImage(
  buffer: Buffer,
  mimeType: ImageMediaType
): VisionImage {
  return {
    base64: buffer.toString('base64'),
    mediaType: mimeType,
  };
}

/**
 * Validate image format
 */
export function isValidImageFormat(mimeType: string): mimeType is ImageMediaType {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mimeType);
}

/**
 * Get mime type from filename
 */
export function getMimeTypeFromFilename(filename: string): ImageMediaType | null {
  const ext = filename.toLowerCase().split('.').pop();
  const mimeMap: Record<string, ImageMediaType> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return mimeMap[ext || ''] || null;
}

// ===========================================
// Singleton Export
// ===========================================

export const claudeVision = new ClaudeVisionService();
