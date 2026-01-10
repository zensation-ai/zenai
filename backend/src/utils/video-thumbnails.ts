import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { logger } from './logger';

const execAsync = promisify(exec);

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
    // Ensure ffmpeg is available
    try {
      await execAsync('which ffmpeg');
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
    const videoFilename = path.basename(videoPath, path.extname(videoPath));
    const thumbnailDir = outputDir || path.join(path.dirname(videoPath), 'thumbnails');

    // Create thumbnails directory
    await fs.mkdir(thumbnailDir, { recursive: true });

    const thumbnailFilename = `${videoFilename}_thumb.jpg`;
    const thumbnailPath = path.join(thumbnailDir, thumbnailFilename);

    // Get video info first
    const videoInfo = await getVideoInfo(videoPath);

    // Generate thumbnail using ffmpeg
    // -ss: seek to timestamp
    // -i: input file
    // -vframes 1: capture 1 frame
    // -vf scale: resize
    // -q:v: quality (1-31, lower is better)
    const ffmpegCmd = `ffmpeg -ss ${timestamp} -i "${videoPath}" -vframes 1 -vf "scale=${width}:-1" -q:v ${quality} -y "${thumbnailPath}" 2>/dev/null`;

    await execAsync(ffmpegCmd);

    // Verify thumbnail was created
    try {
      await fs.access(thumbnailPath);
    } catch {
      // If first frame fails, try at 0 seconds
      const fallbackCmd = `ffmpeg -ss 00:00:00 -i "${videoPath}" -vframes 1 -vf "scale=${width}:-1" -q:v ${quality} -y "${thumbnailPath}" 2>/dev/null`;
      await execAsync(fallbackCmd);
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
 */
export async function getVideoInfo(videoPath: string): Promise<{
  duration: number | null;
  width: number | null;
  height: number | null;
  codec: string | null;
}> {
  try {
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
    const { stdout } = await execAsync(cmd);
    const data = JSON.parse(stdout);

    const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');

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
    const videoFilename = path.basename(videoPath, path.extname(videoPath));
    const gifDir = outputDir || path.join(path.dirname(videoPath), 'previews');

    await fs.mkdir(gifDir, { recursive: true });

    const gifFilename = `${videoFilename}_preview.gif`;
    const gifPath = path.join(gifDir, gifFilename);

    // Generate GIF using ffmpeg
    const cmd = `ffmpeg -ss 00:00:01 -i "${videoPath}" -t ${duration} -vf "fps=${fps},scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 -y "${gifPath}" 2>/dev/null`;

    await execAsync(cmd);

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
