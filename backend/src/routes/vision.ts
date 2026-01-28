/**
 * Vision Routes
 *
 * Professional API endpoints for Claude Vision integration.
 * Enables image analysis, OCR, and visual content understanding.
 *
 * Endpoints:
 * - POST /api/vision/analyze - Analyze image with specified task
 * - POST /api/vision/extract-text - OCR text extraction
 * - POST /api/vision/extract-ideas - Extract actionable ideas from visual content
 * - POST /api/vision/describe - Quick image description
 * - POST /api/vision/compare - Compare multiple images
 * - GET /api/vision/status - Check vision service availability
 *
 * @module routes/vision
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { asyncHandler, ValidationError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import {
  claudeVision,
  VisionImage,
  VisionTask,
  VisionOptions,
  bufferToVisionImage,
  isValidImageFormat,
  ImageMediaType,
} from '../services/claude-vision';

export const visionRouter = Router();

// ===========================================
// Multer Configuration for Image Upload
// ===========================================

/**
 * Multer storage configuration
 * Uses memory storage for direct buffer access
 */
const storage = multer.memoryStorage();

/**
 * File filter to validate image types
 */
const imageFilter = (
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  // Check MIME type
  if (!isValidImageFormat(file.mimetype)) {
    callback(new Error(`Invalid image format: ${file.mimetype}. Supported: JPEG, PNG, GIF, WebP`));
    return;
  }
  callback(null, true);
};

/**
 * Multer upload configuration
 * - Max 10MB per file
 * - Max 5 files for comparison
 * - Only image formats accepted
 */
const upload = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 5, // Max 5 files for comparison
  },
});

// ===========================================
// Helper Functions
// ===========================================

/**
 * Convert uploaded file to VisionImage
 */
function fileToVisionImage(file: Express.Multer.File): VisionImage {
  return bufferToVisionImage(file.buffer, file.mimetype as ImageMediaType);
}

/**
 * Parse vision options from request body
 */
function parseVisionOptions(body: Record<string, unknown>): VisionOptions {
  return {
    maxTokens: typeof body.maxTokens === 'number' ? body.maxTokens : undefined,
    context: typeof body.context === 'string' ? body.context : undefined,
    language: body.language === 'en' ? 'en' : 'de',
    temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
  };
}

/**
 * Validate task parameter
 */
function validateTask(task: unknown): VisionTask {
  const validTasks: VisionTask[] = [
    'describe',
    'extract_text',
    'analyze',
    'extract_ideas',
    'summarize',
    'compare',
    'qa',
  ];

  if (typeof task !== 'string' || !validTasks.includes(task as VisionTask)) {
    throw new ValidationError(
      `Invalid task. Valid tasks: ${validTasks.join(', ')}`
    );
  }

  return task as VisionTask;
}

// ===========================================
// Routes
// ===========================================

/**
 * GET /api/vision/status
 * Check if vision service is available
 */
visionRouter.get(
  '/status',
  apiKeyAuth,
  asyncHandler(async (_req: Request, res: Response) => {
    const available = claudeVision.isAvailable();

    res.json({
      success: true,
      data: {
        available,
        supportedFormats: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
        maxFileSize: '10MB',
        maxFiles: 5,
        availableTasks: [
          'describe',
          'extract_text',
          'analyze',
          'extract_ideas',
          'summarize',
          'compare',
          'qa',
        ],
      },
    });
  })
);

/**
 * POST /api/vision/analyze
 * Analyze image with specified task
 *
 * Body (multipart/form-data):
 * - image: File (required) - Image to analyze
 * - task: string (required) - Analysis task type
 * - context?: string - Additional context
 * - language?: 'de' | 'en' - Response language
 * - maxTokens?: number - Max response tokens
 */
visionRouter.post(
  '/analyze',
  apiKeyAuth,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError('Image file is required');
    }

    const task = validateTask(req.body.task);
    const options = parseVisionOptions(req.body);

    logger.info('Vision analysis requested', {
      task,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    const visionImage = fileToVisionImage(req.file);
    const result = await claudeVision.analyze(visionImage, task, options);

    if (!result.success) {
      throw new Error('Vision analysis failed');
    }

    res.json({
      success: true,
      data: {
        task: result.task,
        text: result.text,
        structured: result.structured,
        metadata: result.metadata,
      },
    });
  })
);

/**
 * POST /api/vision/extract-text
 * OCR-like text extraction from image
 *
 * Body (multipart/form-data):
 * - image: File (required) - Image to extract text from
 * - language?: 'de' | 'en' - Response language
 */
visionRouter.post(
  '/extract-text',
  apiKeyAuth,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError('Image file is required');
    }

    const options = parseVisionOptions(req.body);

    logger.info('Text extraction requested', {
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    const visionImage = fileToVisionImage(req.file);
    const result = await claudeVision.extractText(visionImage, options);

    res.json({
      success: true,
      data: {
        text: result.text,
        confidence: result.confidence,
      },
    });
  })
);

/**
 * POST /api/vision/extract-ideas
 * Extract actionable ideas from visual content (whiteboard, notes, screenshots)
 *
 * Body (multipart/form-data):
 * - image: File (required) - Image to extract ideas from
 * - context?: string - Context for the ideas (e.g., 'work', 'personal')
 * - language?: 'de' | 'en' - Response language
 */
visionRouter.post(
  '/extract-ideas',
  apiKeyAuth,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError('Image file is required');
    }

    const context = (req.body.context as 'work' | 'personal') || 'personal';
    const options = parseVisionOptions(req.body);

    logger.info('Idea extraction requested', {
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      context,
    });

    const visionImage = fileToVisionImage(req.file);
    const ideas = await claudeVision.extractIdeas(visionImage, context, options);

    res.json({
      success: true,
      data: {
        ideas,
        count: ideas.length,
      },
    });
  })
);

/**
 * POST /api/vision/describe
 * Quick image description
 *
 * Body (multipart/form-data):
 * - image: File (required) - Image to describe
 * - language?: 'de' | 'en' - Response language
 */
visionRouter.post(
  '/describe',
  apiKeyAuth,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError('Image file is required');
    }

    const options = parseVisionOptions(req.body);

    logger.info('Image description requested', {
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    const visionImage = fileToVisionImage(req.file);
    const description = await claudeVision.describe(visionImage, options);

    res.json({
      success: true,
      data: {
        description,
      },
    });
  })
);

/**
 * POST /api/vision/ask
 * Ask a question about an image
 *
 * Body (multipart/form-data):
 * - image: File (required) - Image to ask about
 * - question: string (required) - Question to ask
 * - language?: 'de' | 'en' - Response language
 */
visionRouter.post(
  '/ask',
  apiKeyAuth,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError('Image file is required');
    }

    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      throw new ValidationError('Question is required');
    }

    const options = parseVisionOptions(req.body);

    logger.info('Image Q&A requested', {
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      questionLength: question.length,
    });

    const visionImage = fileToVisionImage(req.file);
    const answer = await claudeVision.askAboutImage(visionImage, question, options);

    res.json({
      success: true,
      data: {
        question,
        answer,
      },
    });
  })
);

/**
 * POST /api/vision/compare
 * Compare multiple images
 *
 * Body (multipart/form-data):
 * - images: File[] (required, min 2) - Images to compare
 * - language?: 'de' | 'en' - Response language
 */
visionRouter.post(
  '/compare',
  apiKeyAuth,
  upload.array('images', 5),
  asyncHandler(async (req: Request, res: Response) => {
    const files = req.files as Express.Multer.File[];

    if (!files || files.length < 2) {
      throw new ValidationError('At least 2 images are required for comparison');
    }

    const options = parseVisionOptions(req.body);

    logger.info('Image comparison requested', {
      imageCount: files.length,
      totalSize: files.reduce((acc, f) => acc + f.size, 0),
    });

    const visionImages = files.map(fileToVisionImage);
    const result = await claudeVision.compare(visionImages, options);

    if (!result.success) {
      throw new Error('Image comparison failed');
    }

    res.json({
      success: true,
      data: {
        comparison: result.text,
        metadata: result.metadata,
      },
    });
  })
);

/**
 * POST /api/vision/document
 * Process a document image (screenshot, scan, etc.)
 * Returns text, summary, and extracted ideas
 *
 * Body (multipart/form-data):
 * - image: File (required) - Document image
 * - language?: 'de' | 'en' - Response language
 */
visionRouter.post(
  '/document',
  apiKeyAuth,
  upload.single('image'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new ValidationError('Image file is required');
    }

    const options = parseVisionOptions(req.body);

    logger.info('Document processing requested', {
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
    });

    const visionImage = fileToVisionImage(req.file);
    const result = await claudeVision.processDocument(visionImage, options);

    res.json({
      success: true,
      data: result,
    });
  })
);

// ===========================================
// Error Handler for Multer Errors
// ===========================================

/**
 * Handle Multer-specific errors
 */
visionRouter.use((err: Error, _req: Request, res: Response, next: Function) => {
  if (err instanceof multer.MulterError) {
    let message = 'File upload error';
    const status = 400;

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = 'File too large. Maximum size is 10MB';
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files. Maximum is 5 files';
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected file field';
        break;
      default:
        message = `File upload error: ${err.message}`;
    }

    res.status(status).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message },
    });
    return;
  }

  // Pass non-Multer errors to next handler
  next(err);
});
