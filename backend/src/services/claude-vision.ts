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
// Task-Specific Prompts (Bilingual: DE/EN)
// ===========================================

type PromptSet = { system: string; instruction: string };
type BilingualPrompts = Record<'de' | 'en', PromptSet>;

const VISION_PROMPTS_I18N: Record<VisionTask, BilingualPrompts> = {
  describe: {
    de: {
      system: `Du bist ein Experte für Bildbeschreibung. Beschreibe Bilder präzise, strukturiert und vollständig.`,
      instruction: `Beschreibe dieses Bild detailliert:\n- Was ist zu sehen (Hauptelemente)?\n- Welche Details sind erkennbar?\n- Welcher Kontext/Zweck ist erkennbar?`,
    },
    en: {
      system: `You are an expert in image description. Describe images precisely, structured, and completely.`,
      instruction: `Describe this image in detail:\n- What is visible (main elements)?\n- What details are recognizable?\n- What context/purpose is apparent?`,
    },
  },

  extract_text: {
    de: {
      system: `Du bist ein OCR-Experte. Extrahiere jeden sichtbaren Text aus Bildern präzise und strukturiert.`,
      instruction: `Extrahiere ALLEN sichtbaren Text aus diesem Bild.\n\nFormatiere die Ausgabe als JSON:\n{\n  "extractedText": "Der vollständige extrahierte Text",\n  "textBlocks": [\n    {"position": "oben links", "text": "..."},\n    {"position": "mitte", "text": "..."}\n  ],\n  "confidence": 0.0-1.0\n}`,
    },
    en: {
      system: `You are an OCR expert. Extract all visible text from images precisely and structured.`,
      instruction: `Extract ALL visible text from this image.\n\nFormat the output as JSON:\n{\n  "extractedText": "The complete extracted text",\n  "textBlocks": [\n    {"position": "top left", "text": "..."},\n    {"position": "center", "text": "..."}\n  ],\n  "confidence": 0.0-1.0\n}`,
    },
  },

  analyze: {
    de: {
      system: `Du bist ein Bildanalytiker. Analysiere Bilder tiefgehend und identifiziere wichtige Muster, Informationen und Bedeutungen.`,
      instruction: `Analysiere dieses Bild gründlich:\n\n1. INHALT: Was zeigt das Bild?\n2. KONTEXT: In welchem Zusammenhang steht es?\n3. DETAILS: Welche wichtigen Details sind erkennbar?\n4. BEDEUTUNG: Welche Informationen/Erkenntnisse kann man ableiten?\n5. QUALITÄT: Wie ist die Bildqualität und was fehlt ggf.?`,
    },
    en: {
      system: `You are an image analyst. Analyze images deeply and identify important patterns, information, and meanings.`,
      instruction: `Analyze this image thoroughly:\n\n1. CONTENT: What does the image show?\n2. CONTEXT: What is its context?\n3. DETAILS: What important details are visible?\n4. SIGNIFICANCE: What insights can be derived?\n5. QUALITY: How is the image quality and what might be missing?`,
    },
  },

  extract_ideas: {
    de: {
      system: `Du bist ein Ideen-Extraktor. Identifiziere actionable Ideen, Aufgaben und Erkenntnisse aus visuellen Inhalten.`,
      instruction: `Extrahiere alle Ideen, Aufgaben und Erkenntnisse aus diesem Bild.\n\nAntworte als JSON:\n{\n  "ideas": [\n    {\n      "title": "Kurzer Titel",\n      "type": "idea|task|insight|problem|question",\n      "description": "Beschreibung",\n      "priority": "low|medium|high"\n    }\n  ],\n  "summary": "Zusammenfassung des visuellen Inhalts"\n}`,
    },
    en: {
      system: `You are an idea extractor. Identify actionable ideas, tasks, and insights from visual content.`,
      instruction: `Extract all ideas, tasks, and insights from this image.\n\nRespond as JSON:\n{\n  "ideas": [\n    {\n      "title": "Short title",\n      "type": "idea|task|insight|problem|question",\n      "description": "Description",\n      "priority": "low|medium|high"\n    }\n  ],\n  "summary": "Summary of the visual content"\n}`,
    },
  },

  summarize: {
    de: {
      system: `Du bist ein Zusammenfasser. Fasse visuelle Inhalte prägnant und informativ zusammen.`,
      instruction: `Fasse den Inhalt dieses Bildes in 2-3 Sätzen zusammen. Fokussiere auf die Kernaussage oder Hauptinformation.`,
    },
    en: {
      system: `You are a summarizer. Summarize visual content concisely and informatively.`,
      instruction: `Summarize the content of this image in 2-3 sentences. Focus on the key message or main information.`,
    },
  },

  compare: {
    de: {
      system: `Du bist ein Bild-Vergleicher. Vergleiche mehrere Bilder und identifiziere Gemeinsamkeiten und Unterschiede.`,
      instruction: `Vergleiche diese Bilder:\n\n1. GEMEINSAMKEITEN: Was haben sie gemeinsam?\n2. UNTERSCHIEDE: Was ist unterschiedlich?\n3. ZUSAMMENHANG: Wie hängen sie zusammen?\n4. SCHLUSSFOLGERUNG: Was lässt sich daraus ableiten?`,
    },
    en: {
      system: `You are an image comparator. Compare multiple images and identify similarities and differences.`,
      instruction: `Compare these images:\n\n1. SIMILARITIES: What do they have in common?\n2. DIFFERENCES: What is different?\n3. RELATIONSHIP: How are they connected?\n4. CONCLUSION: What can be inferred?`,
    },
  },

  qa: {
    de: {
      system: `Du bist ein visueller Assistent. Beantworte Fragen zu Bildern präzise und hilfreich.`,
      instruction: `Beantworte die Frage basierend auf dem Bildinhalt.`,
    },
    en: {
      system: `You are a visual assistant. Answer questions about images precisely and helpfully.`,
      instruction: `Answer the question based on the image content.`,
    },
  },
};

/** Get prompts for a task in the specified language (defaults to 'de'). */
function getVisionPrompt(task: VisionTask, language: 'de' | 'en' = 'de'): PromptSet {
  return VISION_PROMPTS_I18N[task][language];
}

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
      const taskConfig = getVisionPrompt(task, language);
      const systemPrompt = taskConfig.system;

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
      const contextLabel = language === 'en' ? 'CONTEXT' : 'KONTEXT';
      let instruction = taskConfig.instruction;
      if (context) {
        instruction = `[${contextLabel}]\n${context}\n\n${instruction}`;
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
   * Uses Promise.allSettled to return partial results on individual failures.
   */
  async processDocument(
    image: VisionImage,
    options?: VisionOptions
  ): Promise<{
    text: string;
    summary: string;
    ideas: Array<{ title: string; type: string; description: string }>;
  }> {
    // Run all three analyses in parallel with partial failure handling
    const [textSettled, ideaSettled, summarySettled] = await Promise.allSettled([
      this.analyze(image, 'extract_text', options),
      this.analyze(image, 'extract_ideas', options),
      this.analyze(image, 'summarize', options),
    ]);

    // Extract results, falling back gracefully on individual failures
    let text = '';
    if (textSettled.status === 'fulfilled') {
      text = textSettled.value.structured?.extractedText || textSettled.value.text;
    } else {
      logger.warn('Document text extraction failed', { error: textSettled.reason });
    }

    let ideas: Array<{ title: string; type: string; description: string }> = [];
    if (ideaSettled.status === 'fulfilled') {
      ideas = ideaSettled.value.structured?.ideas || [];
    } else {
      logger.warn('Document idea extraction failed', { error: ideaSettled.reason });
    }

    let summary = '';
    if (summarySettled.status === 'fulfilled') {
      summary = summarySettled.value.text;
    } else {
      logger.warn('Document summarization failed', { error: summarySettled.reason });
    }

    // If all three failed, throw to signal total failure
    if (textSettled.status === 'rejected' && ideaSettled.status === 'rejected' && summarySettled.status === 'rejected') {
      throw new Error('All document processing steps failed');
    }

    return { text, summary, ideas };
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
