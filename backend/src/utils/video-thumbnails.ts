import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';

/**
 * SECURITY: Execute command with spawn (no shell interpolation)
 * Prevents command injection attacks
 */
function spawnAsync(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * SECURITY: Validate video path to prevent path traversal
 */
function validateVideoPath(videoPath: string): string {
  const normalizedPath = path.normalize(videoPath);
  if (normalizedPath.includes('..') || !path.isAbsolute(normalizedPath)) {
    throw new Error('Invalid video path');
  }
  return normalizedPath;
}

export interface ThumbnailResult {
  success: boolean;
  thumbnailPath: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  error?: string;
}

/**
 * Generate a thumbnail from a video file using ffmpeg
 */
export async function generateVideoThumbnail(
  videoPath: string,
  outputDir?: string,
  options: {
    timestamp?: string;  // Time to capture (default: "00:00:01")
    width?: number;      // Thumbnail width (default: 320)
    quality?: number;    // JPEG quality 1-31 (default: 5)
  } = {}
): Promise<ThumbnailResult> {
  const {
    timestamp = '00:00:01',
    width = 320,
    quality = 5
  } = options;

  try {
    // SECURITY: Validate video path
    const safeVideoPath = validateVideoPath(videoPath);

    // Ensure ffmpeg is available
    try {
      await spawnAsync('which', ['ffmpeg']);
    } catch {
      return {
        success: false,
        thumbnailPath: null,
        duration: null,
        width: null,
        height: null,
        error: 'ffmpeg not installed'
      };
    }

    // Generate output path
    const videoFilename = path.basename(safeVideoPath, path.extname(safeVideoPath));
    const thumbnailDir = outputDir || path.join(path.dirname(safeVideoPath), 'thumbnails');

    // Create thumbnails directory
    await fs.mkdir(thumbnailDir, { recursive: true });

    const thumbnailFilename = `${videoFilename}_thumb.jpg`;
    const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

    // Get video info first
    const videoInfo = await getVideoInfo(safeVideoPath);

    // Generate thumbnail using ffmpeg (spawn prevents command injection)
    // -ss: seek to timestamp
    // -i: input file
    // -vframes 1: capture 1 frame
    // -vf scale: resize
    // -q:v: quality (1-31, lower is better)
    const ffmpegArgs = [
      '-ss', timestamp,
      '-i', safeVideoPath,
      '-vframes', '1',
      '-vf', `scale=${width}:-1`,
      '-q:v', quality.toString(),
      '-y', thumbnailPath
    ];

    await spawnAsync('ffmpeg', ffmpegArgs);

    // Verify thumbnail was created
    try {
      await fs.access(thumbnailPath);
    } catch {
      // If first frame fails, try at 0 seconds
      const fallbackArgs = [
        '-ss', '00:00:00',
        '-i', safeVideoPath,
        '-vframes', '1',
        '-vf', `scale=${width}:-1`,
        '-q:v', quality.toString(),
        '-y', thumbnailPath
      ];
      await spawnAsync('ffmpeg', fallbackArgs);
    }

    logger.info('Generated video thumbnail', { thumbnailFilename });

    return {
      success: true,
      thumbnailPath,
      duration: videoInfo.duration,
      width: videoInfo.width,
      height: videoInfo.height
    };

  } catch (error) {
    logger.error('Thumbnail generation error', error instanceof Error ? error : undefined);
    return {
      success: false,
      thumbnailPath: null,
      duration: null,
      width: null,
      height: null,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Generate multiple thumbnails at different timestamps
 */
export async function generateVideoThumbnailStrip(
  videoPath: string,
  outputDir?: string,
  count: number = 4
): Promise<{
  success: boolean;
  thumbnails: string[];
  duration: number | null;
}> {
  try {
    const videoInfo = await getVideoInfo(videoPath);

    if (!videoInfo.duration || videoInfo.duration < 1) {
      return {
        success: false,
        thumbnails: [],
        duration: null
      };
    }

    const thumbnails: string[] = [];
    const interval = videoInfo.duration / (count + 1);

    for (let i = 1; i <= count; i++) {
      const timestamp = formatTimestamp(interval * i);
      const result = await generateVideoThumbnail(videoPath, outputDir, {
        timestamp,
        width: 160
      });

      if (result.success && result.thumbnailPath) {
        // Rename to include index
        const newPath = result.thumbnailPath.replace('_thumb.jpg', `_thumb_${i}.jpg`);
        await fs.rename(result.thumbnailPath, newPath);
        thumbnails.push(newPath);
      }
    }

    return {
      success: thumbnails.length > 0,
      thumbnails,
      duration: videoInfo.duration
    };

  } catch (error) {
    logger.error('Thumbnail strip generation error', error instanceof Error ? error : undefined);
    return {
      success: false,
      thumbnails: [],
      duration: null
    };
  }
}

/**
 * Get video information using ffprobe
 * SECURITY: Uses spawn to prevent command injection
 */
export async function getVideoInfo(videoPath: string): Promise<{
  duration: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
}> {
  try {
    // SECURITY: Validate video path
    const safeVideoPath = validateVideoPath(videoPath);

    const ffprobeArgs = [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      safeVideoPath
    ];

    const { stdout } = await spawnAsync('ffprobe', ffprobeArgs);
    const data = JSON.parse(stdout);

    interface VideoStream {
      codec_type: string;
      width?: number;
      height?: number;
      codec_name?: string;
    }

    const videoStream = data.streams?.find((s: VideoStream) => s.codec_type === 'video');

    return {
      duration: data.format?.duration ? parseFloat(data.format.duration) : null,
      width: videoStream?.width || null,
      height: videoStream?.height || null,
      codec: videoStream?.codec_name || null
    };

  } catch (error) {
    logger.error('Error getting video info', error instanceof Error ? error : undefined);
    return {
      duration: null,
      width: null,
      height: null,
      codec: null
    };
  }
}

/**
 * Create animated GIF preview from video
 * SECURITY: Uses spawn to prevent command injection
 */
export async function generateVideoGifPreview(
  videoPath: string,
  outputDir?: string,
  options: {
    duration?: number;  // GIF duration in seconds (default: 3)
    fps?: number;       // Frames per second (default: 10)
    width?: number;     // GIF width (default: 240)
  } = {}
): Promise<{
  success: boolean;
  gifPath: string | null;
}> {
  const {
    duration = 3,
    fps = 10,
    width = 240
  } = options;

  try {
    // SECURITY: Validate video path
    const safeVideoPath = validateVideoPath(videoPath);

    const videoFilename = path.basename(safeVideoPath, path.extname(safeVideoPath));
    const gifDir = outputDir || path.join(path.dirname(safeVideoPath), 'previews');

    await fs.mkdir(gifDir, { recursive: true });

    const gifFilename = `${videoFilename}_preview.gif`;
    const gifPath = path.join(gifDir, gifFilename);

    // Generate GIF using ffmpeg (spawn prevents command injection)
    const ffmpegArgs = [
      '-ss', '00:00:01',
      '-i', safeVideoPath,
      '-t', duration.toString(),
      '-vf', `fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
      '-loop', '0',
      '-y', gifPath
    ];

    await spawnAsync('ffmpeg', ffmpegArgs);

    logger.info('Generated GIF preview', { gifFilename });

    return {
      success: true,
      gifPath
    };

  } catch (error) {
    logger.error('GIF generation error', error instanceof Error ? error : undefined);
    return {
      success: false,
      gifPath: null
    };
  }
}

// Helper function to format seconds to HH:MM:SS
function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default {
  generateVideoThumbnail,
  generateVideoThumbnailStrip,
  getVideoInfo,
  generateVideoGifPreview
};
