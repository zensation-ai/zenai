import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { query } from '../utils/database';
import { isValidUUID } from '../utils/database-context';
import { generateEmbedding } from '../utils/ollama';
import crypto from 'crypto';
import { analyzeImage, extractTextFromImage, analyzeDocument } from '../utils/image-analysis';
import { generateVideoThumbnail, getVideoInfo, generateVideoGifPreview } from '../utils/video-thumbnails';
import { apiKeyAuth, requireScope } from '../middleware/auth';
import { logger } from '../utils/logger';
import { asyncHandler, ValidationError, NotFoundError } from '../middleware/errorHandler';

// Validation helpers
const VALID_CONTEXTS = ['personal', 'work'] as const;
const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

function validateMediaId(id: string): void {
  if (!isValidUUID(id)) {
    throw new ValidationError('Invalid media ID format. Must be a valid UUID.');
  }
}

function validateContext(context: string): void {
  if (!VALID_CONTEXTS.includes(context as any)) {
    throw new ValidationError('Invalid context. Use "personal" or "work".');
  }
}

function parseLimit(limitStr: string | undefined): number {
  if (!limitStr) {return DEFAULT_LIMIT;}
  const limit = parseInt(limitStr, 10);
  if (isNaN(limit) || limit < 1) {return DEFAULT_LIMIT;}
  return Math.min(limit, MAX_LIMIT);
}

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/media');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${crypto.randomUUID()}`;
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// Allowed MIME types and extensions for security
const ALLOWED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'video/quicktime',
  'video/mp4',
  'audio/wav',
  'audio/m4a',
  'audio/mpeg'
] as const;

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.heic', '.mov', '.mp4', '.wav', '.m4a', '.mp3'];

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit (reduced from 100MB for security)
    files: 1 // Max 1 file per request
  },
  fileFilter: (req, file, cb) => {
    // Validate MIME type
    if (!ALLOWED_MIMES.includes(file.mimetype as typeof ALLOWED_MIMES[number])) {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only images, videos, and audio allowed.`));
      return;
    }

    // Validate extension (double-check against MIME spoofing)
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      cb(new Error(`Invalid file extension: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`));
      return;
    }

    cb(null, true);
  }
});

// Multi-file upload for media + voice
const multiUpload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024
  }
}).fields([
  { name: 'media', maxCount: 1 },
  { name: 'voice', maxCount: 1 }
]);

/**
 * POST /api/:context/media
 * Upload photo or video with context
 */
router.post('/:context/media', apiKeyAuth, requireScope('write'), upload.single('media'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const file = req.file;
  const caption = req.body.caption || '';

  if (!file) {
    throw new ValidationError('No media file uploaded');
  }

  // Validate context
  validateContext(context);

  // Determine media type
  const mediaType = file.mimetype.startsWith('image/') ? 'photo' : 'video';

  // Generate embedding from caption if provided
  let embedding: number[] | null = null;
  if (caption) {
    embedding = await generateEmbedding(caption);
  }

  // Store media metadata in database
  const result = await query(
    `INSERT INTO media_items (
      media_type,
      filename,
      file_path,
      mime_type,
      file_size,
      caption,
      context,
      embedding,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    RETURNING id, media_type, filename, caption, context, created_at`,
    [
      mediaType,
      file.filename,
      file.path,
      file.mimetype,
      file.size,
      caption,
      context,
      embedding ? `[${embedding.join(',')}]` : null
    ]
  );

  const mediaItem = result.rows[0];

  // If no caption, we could analyze the image/video later
  // For now, we'll just store it

  logger.info('Media uploaded', { mediaType, filename: file.filename, contextName: context });

  res.status(201).json({
    success: true,
    mediaId: mediaItem.id,
    mediaType: mediaItem.media_type,
    filename: mediaItem.filename,
    context: mediaItem.context,
    processingStatus: caption ? 'completed' : 'pending',
    message: caption ? 'Media uploaded successfully' : 'Media uploaded, awaiting analysis'
  });
}));

/**
 * GET /api/all-media
 * Get all media items (renamed to avoid conflict with /:context/media)
 */
router.get('/all-media', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { context, type, limit = '50' } = req.query;

  let queryStr = 'SELECT id, media_type, filename, caption, context, created_at FROM media_items WHERE 1=1';
  const params: any[] = [];
  let paramCount = 1;

  if (context) {
    queryStr += ` AND context = $${paramCount}`;
    params.push(context);
    paramCount++;
  }

  if (type) {
    queryStr += ` AND media_type = $${paramCount}`;
    params.push(type);
    paramCount++;
  }

  queryStr += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
  params.push(parseLimit(limit as string | undefined));

  const result = await query(queryStr, params);

  res.json({
    media: result.rows,
    total: result.rows.length
  });
}));

/**
 * GET /api/media-file/:id
 * Get specific media file (renamed to avoid conflict)
 */
router.get('/media-file/:id', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateMediaId(id);

  const result = await query(
    'SELECT * FROM media_items WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Media');
  }

  const mediaItem = result.rows[0];

  // Security: Validate file path to prevent path traversal attacks
  const filePath = mediaItem.file_path;
  const uploadDir = path.join(__dirname, '../../uploads');
  const resolvedPath = path.resolve(filePath);

  // Ensure the resolved path is within the uploads directory
  if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
    logger.warn('Path traversal attempt detected', { filePath });
    throw new ValidationError('Access denied');
  }

  // Check if file exists
  try {
    await fs.access(resolvedPath);
  } catch {
    throw new NotFoundError('File on disk');
  }

  res.sendFile(resolvedPath);
}));

/**
 * POST /api/:context/media/analyze
 * Analyze an uploaded image using AI vision
 */
router.post('/:context/media/analyze', apiKeyAuth, requireScope('write'), upload.single('image'), asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const file = req.file;
  const analysisType = req.body.type || 'general'; // general, document, whiteboard

  if (!file) {
    throw new ValidationError('No image file uploaded');
  }

  // Validate it's an image
  if (!file.mimetype.startsWith('image/')) {
    throw new ValidationError('Only image files can be analyzed');
  }

  logger.info('Analyzing image', { filename: file.filename, analysisType });

  // Run analysis based on type
  let analysisResult: any;
  let ocrText: string | null = null;
  let captionText = '';

  if (analysisType === 'document') {
    const docResult = await analyzeDocument(file.path);
    analysisResult = docResult;
    captionText = docResult.summary;
    ocrText = await extractTextFromImage(file.path);
  } else {
    const imageResult = await analyzeImage(file.path, analysisType);
    analysisResult = imageResult;
    captionText = imageResult.description;
    // Try OCR for any image
    ocrText = await extractTextFromImage(file.path);
  }

  // Generate embedding from description
  let embedding: number[] | null = null;
  const textForEmbedding = captionText || ocrText;
  if (textForEmbedding) {
    embedding = await generateEmbedding(textForEmbedding);
  }

  // Store analysis result in database
  const result = await query(
    `INSERT INTO media_items (
      media_type,
      filename,
      file_path,
      mime_type,
      file_size,
      caption,
      ocr_text,
      ai_analysis,
      context,
      embedding,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    RETURNING id, media_type, filename, caption, context, created_at`,
    [
      'photo',
      file.filename,
      file.path,
      file.mimetype,
      file.size,
      captionText,
      ocrText,
      JSON.stringify(analysisResult),
      context,
      embedding ? `[${embedding.join(',')}]` : null
    ]
  );

  const mediaItem = result.rows[0];

  logger.info('Image analyzed', { filename: file.filename });

  res.json({
    success: true,
    mediaId: mediaItem.id,
    analysis: analysisResult,
    ocrText: ocrText,
    context: context,
    message: 'Image analyzed successfully'
  });
}));

/**
 * POST /api/:context/media-with-voice
 * Upload photo/video with optional voice memo for context
 */
router.post('/:context/media-with-voice', apiKeyAuth, requireScope('write'), multiUpload, asyncHandler(async (req: Request, res: Response) => {
  const { context } = req.params;
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };
  const mediaFile = files['media']?.[0];
  const voiceFile = files['voice']?.[0];
  let caption = req.body.caption || '';

  if (!mediaFile) {
    throw new ValidationError('No media file uploaded');
  }

  // Validate context
  validateContext(context);

  // Determine media type
  const mediaType = mediaFile.mimetype.startsWith('image/') ? 'photo' : 'video';

  // If voice file provided, transcribe it to get caption
  let voiceTranscript: string | null = null;
  if (voiceFile) {
    try {
      // Import whisper transcription (assuming it exists)
      const { transcribeAudio } = require('../utils/whisper');
      voiceTranscript = await transcribeAudio(voiceFile.path);
      caption = voiceTranscript || caption;
      logger.info('Voice transcribed', { preview: voiceTranscript?.substring(0, 50) });
    } catch (err) {
      logger.warn('Voice transcription failed', { error: err });
      // Continue without transcription
    }
  }

  // Generate embedding from caption if available
  let embedding: number[] | null = null;
  if (caption) {
    embedding = await generateEmbedding(caption);
  }

  // Store media metadata in database
  const result = await query(
    `INSERT INTO media_items (
      media_type,
      filename,
      file_path,
      mime_type,
      file_size,
      caption,
      voice_transcript,
      voice_file_path,
      context,
      embedding,
      created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
    RETURNING id, media_type, filename, caption, context, created_at`,
    [
      mediaType,
      mediaFile.filename,
      mediaFile.path,
      mediaFile.mimetype,
      mediaFile.size,
      caption,
      voiceTranscript,
      voiceFile?.path || null,
      context,
      embedding ? `[${embedding.join(',')}]` : null
    ]
  );

  const mediaItem = result.rows[0];

  logger.info('Media with voice uploaded', { mediaType, filename: mediaFile.filename, contextName: context, hasVoice: !!voiceFile });

  res.status(201).json({
    success: true,
    mediaId: mediaItem.id,
    mediaType: mediaItem.media_type,
    filename: mediaItem.filename,
    context: mediaItem.context,
    hasVoice: !!voiceFile,
    voiceTranscript: voiceTranscript,
    processingStatus: 'completed',
    message: voiceFile
      ? 'Media with voice context uploaded successfully'
      : 'Media uploaded successfully'
  });
}));

/**
 * POST /api/media/:id/thumbnail
 * Generate thumbnail for a video
 */
router.post('/media/:id/thumbnail', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateMediaId(id);
  const { timestamp = '00:00:01' } = req.body;

  // Get media item
  const result = await query(
    'SELECT * FROM media_items WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Media');
  }

  const mediaItem = result.rows[0];

  // Validate it's a video
  if (mediaItem.media_type !== 'video') {
    throw new ValidationError('Can only generate thumbnails for videos');
  }

  logger.info('Generating thumbnail', { filename: mediaItem.filename });

  // Generate thumbnail
  const thumbnailResult = await generateVideoThumbnail(mediaItem.file_path, undefined, {
    timestamp,
    width: 480
  });

  if (!thumbnailResult.success) {
    throw new ValidationError(thumbnailResult.error || 'Failed to generate thumbnail');
  }

  // Update database with thumbnail path
  await query(
    'UPDATE media_items SET thumbnail_path = $1, duration = $2, width = $3, height = $4 WHERE id = $5',
    [
      thumbnailResult.thumbnailPath,
      thumbnailResult.duration,
      thumbnailResult.width,
      thumbnailResult.height,
      id
    ]
  );

  logger.info('Thumbnail generated', { filename: mediaItem.filename });

  res.json({
    success: true,
    mediaId: id,
    thumbnailPath: thumbnailResult.thumbnailPath,
    duration: thumbnailResult.duration,
    dimensions: {
      width: thumbnailResult.width,
      height: thumbnailResult.height
    }
  });
}));

/**
 * GET /api/media/:id/thumbnail
 * Get thumbnail for a media item
 */
router.get('/media/:id/thumbnail', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateMediaId(id);

  const result = await query(
    'SELECT thumbnail_path FROM media_items WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Media');
  }

  const { thumbnail_path } = result.rows[0];

  if (!thumbnail_path) {
    throw new NotFoundError('Thumbnail not yet generated');
  }

  // Security: Validate thumbnail path to prevent path traversal attacks
  const uploadDir = path.join(__dirname, '../../uploads');
  const resolvedPath = path.resolve(thumbnail_path);

  if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
    logger.warn('Path traversal attempt detected', { thumbnailPath: thumbnail_path });
    throw new ValidationError('Access denied');
  }

  res.sendFile(resolvedPath);
}));

/**
 * POST /api/media/:id/gif-preview
 * Generate animated GIF preview for a video
 */
router.post('/media/:id/gif-preview', apiKeyAuth, requireScope('write'), asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateMediaId(id);
  const { duration = 3 } = req.body;

  // Get media item
  const result = await query(
    'SELECT * FROM media_items WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Media');
  }

  const mediaItem = result.rows[0];

  if (mediaItem.media_type !== 'video') {
    throw new ValidationError('Can only generate GIF previews for videos');
  }

  logger.info('Generating GIF preview', { filename: mediaItem.filename });

  const gifResult = await generateVideoGifPreview(mediaItem.file_path, undefined, {
    duration,
    fps: 10,
    width: 320
  });

  if (!gifResult.success) {
    throw new ValidationError('Failed to generate GIF preview');
  }

  // Update database
  await query(
    'UPDATE media_items SET gif_preview_path = $1 WHERE id = $2',
    [gifResult.gifPath, id]
  );

  res.json({
    success: true,
    mediaId: id,
    gifPath: gifResult.gifPath
  });
}));

/**
 * GET /api/media/:id/info
 * Get video info (duration, dimensions, etc.)
 */
router.get('/media/:id/info', apiKeyAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  validateMediaId(id);

  const result = await query(
    'SELECT * FROM media_items WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    throw new NotFoundError('Media');
  }

  const mediaItem = result.rows[0];

  // If it's a video and we don't have info yet, fetch it
  if (mediaItem.media_type === 'video' && !mediaItem.duration) {
    const videoInfo = await getVideoInfo(mediaItem.file_path);

    // Update database
    await query(
      'UPDATE media_items SET duration = $1, width = $2, height = $3 WHERE id = $4',
      [videoInfo.duration, videoInfo.width, videoInfo.height, id]
    );

    return res.json({
      id: mediaItem.id,
      mediaType: mediaItem.media_type,
      filename: mediaItem.filename,
      duration: videoInfo.duration,
      dimensions: {
        width: videoInfo.width,
        height: videoInfo.height
      },
      codec: videoInfo.codec,
      thumbnailPath: mediaItem.thumbnail_path,
      gifPreviewPath: mediaItem.gif_preview_path
    });
  }

  res.json({
    id: mediaItem.id,
    mediaType: mediaItem.media_type,
    filename: mediaItem.filename,
    duration: mediaItem.duration,
    dimensions: {
      width: mediaItem.width,
      height: mediaItem.height
    },
    thumbnailPath: mediaItem.thumbnail_path,
    gifPreviewPath: mediaItem.gif_preview_path
  });
}));

export default router;
