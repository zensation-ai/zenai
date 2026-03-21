/**
 * Chat Vision - Vision-enhanced message processing
 */

import { logger } from '../../utils/logger';
import { claudeVision, VisionImage } from '../claude-vision';
import {
  VisionMessageResult,
  addMessage,
  updateSessionTitle,
} from './chat-sessions';

// Re-export VisionImage for convenience
export type { VisionImage };

/**
 * Send a message with images and get AI response
 *
 * Uses Claude Vision to analyze images and incorporate them into the response.
 * Supports various vision tasks: describe, analyze, qa, extract_text, extract_ideas, etc.
 *
 * @param sessionId - Chat session ID
 * @param userMessage - Text message (optional for pure image analysis)
 * @param images - Array of VisionImage objects
 * @param task - Vision task type
 * @param contextType - Context for memory and RAG
 * @param includeMetadata - Whether to include processing metadata
 */
export async function sendMessageWithVision(
  sessionId: string,
  userMessage: string,
  images: VisionImage[],
  task: string = 'qa',
  contextType: 'personal' | 'work' | 'learning' | 'creative' | 'demo' = 'personal',
  includeMetadata: boolean = false,
  userId?: string
): Promise<VisionMessageResult> {
  const startTime = Date.now();

  // Build user message content with image indicator
  const imageIndicator = images.length === 1
    ? '[Bild angehängt]'
    : `[${images.length} Bilder angehängt]`;

  const fullUserMessage = userMessage
    ? `${userMessage}\n\n${imageIndicator}`
    : imageIndicator;

  // Store user message (with image indicator in text)
  const storedUserMessage = await addMessage(sessionId, 'user', fullUserMessage, userId);

  // Update title if this is the first message
  await updateSessionTitle(sessionId, userMessage || 'Bildanalyse');

  logger.info('Processing vision message', {
    sessionId,
    task,
    imageCount: images.length,
    hasTextMessage: !!userMessage,
  });

  let aiResponse: string;
  let visionResult;

  try {
    // Use the appropriate vision method based on task
    switch (task) {
      case 'describe':
        aiResponse = await claudeVision.describe(images[0], { language: 'de' });
        break;

      case 'extract_text': {
        const textResult = await claudeVision.extractText(images[0], { language: 'de' });
        aiResponse = `**Extrahierter Text:**\n\n${textResult.text}\n\n*Konfidenz: ${Math.round(textResult.confidence * 100)}%*`;
        break;
      }

      case 'extract_ideas': {
        const ideas = await claudeVision.extractIdeas(images[0], contextType, { language: 'de' });
        if (ideas.length > 0) {
          const ideaList = ideas.map((idea, i) =>
            `${i + 1}. **${idea.title}** (${idea.type})\n   ${idea.description}`
          ).join('\n\n');
          aiResponse = `**Extrahierte Ideen:**\n\n${ideaList}`;
        } else {
          aiResponse = 'Ich konnte keine konkreten Ideen aus dem Bild extrahieren.';
        }
        break;
      }

      case 'analyze':
        visionResult = await claudeVision.analyze(images[0], 'analyze', { language: 'de' });
        aiResponse = visionResult.text;
        break;

      case 'summarize':
        visionResult = await claudeVision.analyze(images[0], 'summarize', { language: 'de' });
        aiResponse = visionResult.text;
        break;

      case 'compare':
        if (images.length < 2) {
          aiResponse = 'Für einen Vergleich werden mindestens 2 Bilder benötigt.';
        } else {
          visionResult = await claudeVision.compare(images, { language: 'de' });
          aiResponse = visionResult.text;
        }
        break;

      case 'qa':
      default:
        // Question-answering about the image(s)
        if (userMessage) {
          aiResponse = await claudeVision.askAboutImage(images[0], userMessage, { language: 'de' });
        } else {
          // Default to description if no question provided
          aiResponse = await claudeVision.describe(images[0], { language: 'de' });
        }
        break;
    }
  } catch (error) {
    logger.error('Vision processing failed', error instanceof Error ? error : undefined);
    throw new Error(
      `Vision processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Store AI response
  const storedAssistantMessage = await addMessage(sessionId, 'assistant', aiResponse, userId);

  // Record as episodic memory (non-blocking)
  // Import dynamically to avoid circular dependency
  const { episodicMemory } = await import('../memory');
  episodicMemory.store(
    `[Vision: ${task}] ${userMessage || 'Bildanalyse'}`,
    aiResponse,
    sessionId,
    contextType
  ).catch(error => {
    logger.warn('Failed to record vision episodic memory', { sessionId, error });
  });

  const processingTimeMs = Date.now() - startTime;

  logger.info('Vision chat message complete', {
    sessionId,
    task,
    imageCount: images.length,
    processingTimeMs,
  });

  const result: VisionMessageResult = {
    userMessage: storedUserMessage,
    assistantMessage: storedAssistantMessage,
  };

  if (includeMetadata) {
    result.metadata = {
      mode: 'conversation',
      modeConfidence: 1.0,
      visionTask: task,
      imageCount: images.length,
      processingTimeMs,
    };
  }

  return result;
}
