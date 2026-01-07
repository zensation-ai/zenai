import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { query } from '../utils/database';
import { generateEmbedding } from '../utils/ollama';
import crypto from 'crypto';
import { analyzeImage, extractTextFromImage, analyzeDocument } from '../utils/image-analysis';
import { generateVideoThumbnail, getVideoInfo, generateVideoGifPreview } from '../utils/video-thumbnails';

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

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/png',
      'image/heic',
      'video/quicktime',
      'video/mp4',
      'audio/wav',
      'audio/m4a',
      'audio/mpeg'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images, videos, and audio allowed.'));
    }
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
router.post('/:context/media', upload.single('media'), async (req: Request, res: Response) => {
  try {
    const { context } = req.params;
    const file = req.file;
    const caption = req.body.caption || '';

    if (!file) {
      return res.status(400).json({ error: 'No media file uploaded' });
    }

    // Validate context
    const validContexts = ['personal', 'work', 'creative', 'strategic'];
    if (!validContexts.includes(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

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

    console.log(`✅ Media uploaded: ${mediaType} - ${file.filename} (${context})`);

    res.json({
      success: true,
      mediaId: mediaItem.id,
      mediaType: mediaItem.media_type,
      filename: mediaItem.filename,
      context: mediaItem.context,
      processingStatus: caption ? 'completed' : 'pending',
      message: caption ? 'Media uploaded successfully' : 'Media uploaded, awaiting analysis'
    });

  } catch (error) {
    console.error('❌ Media upload error:', error);
    res.status(500).json({ error: 'Failed to upload media' });
  }
});

/**
 * GET /api/all-media
 * Get all media items (renamed to avoid conflict with /:context/media)
 */
router.get('/all-media', async (req: Request, res: Response) => {
  try {
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
    params.push(parseInt(limit as string));

    const result = await query(queryStr, params);

    res.json({
      media: result.rows,
      total: result.rows.length
    });

  } catch (error) {
    console.error('❌ Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

/**
 * GET /api/media-file/:id
 * Get specific media file (renamed to avoid conflict)
 */
router.get('/media-file/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM media_items WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const mediaItem = result.rows[0];

    // Security: Validate file path to prevent path traversal attacks
    const filePath = mediaItem.file_path;
    const uploadDir = path.join(__dirname, '../../uploads');
    const resolvedPath = path.resolve(filePath);

    // Ensure the resolved path is within the uploads directory
    if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
      console.error('❌ Path traversal attempt detected:', filePath);
      return res.status(403).json({ error: 'Access denied' });
    }

    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      return res.status(404).json({ error: 'File not found on disk' });
    }

    res.sendFile(resolvedPath);

  } catch (error) {
    console.error('❌ Error fetching media:', error);
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

/**
 * POST /api/:context/media/analyze
 * Analyze an uploaded image using AI vision
 */
router.post('/:context/media/analyze', upload.single('image'), async (req: Request, res: Response) => {
  try {
    const { context } = req.params;
    const file = req.file;
    const analysisType = req.body.type || 'general'; // general, document, whiteboard

    if (!file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    // Validate it's an image
    if (!file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only image files can be analyzed' });
    }

    console.log(`🔍 Analyzing image: ${file.filename} (type: ${analysisType})`);

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

    console.log(`✅ Image analyzed: ${file.filename}`);

    res.json({
      success: true,
      mediaId: mediaItem.id,
      analysis: analysisResult,
      ocrText: ocrText,
      context: context,
      message: 'Image analyzed successfully'
    });

  } catch (error) {
    console.error('❌ Image analysis error:', error);
    res.status(500).json({ error: 'Failed to analyze image' });
  }
});

/**
 * POST /api/:context/media-with-voice
 * Upload photo/video with optional voice memo for context
 */
router.post('/:context/media-with-voice', multiUpload, async (req: Request, res: Response) => {
  try {
    const { context } = req.params;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    const mediaFile = files['media']?.[0];
    const voiceFile = files['voice']?.[0];
    let caption = req.body.caption || '';

    if (!mediaFile) {
      return res.status(400).json({ error: 'No media file uploaded' });
    }

    // Validate context
    const validContexts = ['personal', 'work', 'creative', 'strategic'];
    if (!validContexts.includes(context)) {
      return res.status(400).json({ error: 'Invalid context' });
    }

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
        console.log(`🎤 Transcribed voice: ${voiceTranscript?.substring(0, 50)}...`);
      } catch (err) {
        console.error('Voice transcription failed:', err);
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

    console.log(`✅ Media+Voice uploaded: ${mediaType} - ${mediaFile.filename} (${context})${voiceFile ? ' with voice' : ''}`);

    res.json({
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

  } catch (error) {
    console.error('❌ Media+Voice upload error:', error);
    res.status(500).json({ error: 'Failed to upload media with voice' });
  }
});

/**
 * POST /api/media/:id/thumbnail
 * Generate thumbnail for a video
 */
router.post('/media/:id/thumbnail', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { timestamp = '00:00:01' } = req.body;

    // Get media item
    const result = await query(
      'SELECT * FROM media_items WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const mediaItem = result.rows[0];

    // Validate it's a video
    if (mediaItem.media_type !== 'video') {
      return res.status(400).json({ error: 'Can only generate thumbnails for videos' });
    }

    console.log(`📸 Generating thumbnail for video: ${mediaItem.filename}`);

    // Generate thumbnail
    const thumbnailResult = await generateVideoThumbnail(mediaItem.file_path, undefined, {
      timestamp,
      width: 480
    });

    if (!thumbnailResult.success) {
      return res.status(500).json({
        error: 'Failed to generate thumbnail',
        details: thumbnailResult.error
      });
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

    console.log(`✅ Thumbnail generated for: ${mediaItem.filename}`);

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

  } catch (error) {
    console.error('❌ Thumbnail generation error:', error);
    res.status(500).json({ error: 'Failed to generate thumbnail' });
  }
});

/**
 * GET /api/media/:id/thumbnail
 * Get thumbnail for a media item
 */
router.get('/media/:id/thumbnail', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT thumbnail_path FROM media_items WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const { thumbnail_path } = result.rows[0];

    if (!thumbnail_path) {
      return res.status(404).json({ error: 'Thumbnail not yet generated' });
    }

    // Security: Validate thumbnail path to prevent path traversal attacks
    const uploadDir = path.join(__dirname, '../../uploads');
    const resolvedPath = path.resolve(thumbnail_path);

    if (!resolvedPath.startsWith(path.resolve(uploadDir))) {
      console.error('❌ Path traversal attempt detected:', thumbnail_path);
      return res.status(403).json({ error: 'Access denied' });
    }

    res.sendFile(resolvedPath);

  } catch (error) {
    console.error('❌ Error fetching thumbnail:', error);
    res.status(500).json({ error: 'Failed to fetch thumbnail' });
  }
});

/**
 * POST /api/media/:id/gif-preview
 * Generate animated GIF preview for a video
 */
router.post('/media/:id/gif-preview', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { duration = 3 } = req.body;

    // Get media item
    const result = await query(
      'SELECT * FROM media_items WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const mediaItem = result.rows[0];

    if (mediaItem.media_type !== 'video') {
      return res.status(400).json({ error: 'Can only generate GIF previews for videos' });
    }

    console.log(`🎬 Generating GIF preview for: ${mediaItem.filename}`);

    const gifResult = await generateVideoGifPreview(mediaItem.file_path, undefined, {
      duration,
      fps: 10,
      width: 320
    });

    if (!gifResult.success) {
      return res.status(500).json({ error: 'Failed to generate GIF preview' });
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

  } catch (error) {
    console.error('❌ GIF preview error:', error);
    res.status(500).json({ error: 'Failed to generate GIF preview' });
  }
});

/**
 * GET /api/media/:id/info
 * Get video info (duration, dimensions, etc.)
 */
router.get('/media/:id/info', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await query(
      'SELECT * FROM media_items WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
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

  } catch (error) {
    console.error('❌ Error fetching media info:', error);
    res.status(500).json({ error: 'Failed to fetch media info' });
  }
});

export default router;
