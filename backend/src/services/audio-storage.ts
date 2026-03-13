/**
 * Audio Storage Service
 *
 * Stores meeting audio files in Supabase Storage.
 * Provides upload, signed URL generation, and deletion.
 * Graceful fallback when Supabase is not configured.
 */

import { supabase } from '../utils/supabase';
import { logger } from '../utils/logger';

const BUCKET_NAME = 'meeting-audio';
const SIGNED_URL_EXPIRY_SECONDS = 3600; // 1 hour

export interface AudioUploadResult {
  storagePath: string;
  sizeBytes: number;
  mimeType: string;
}

/**
 * Check if audio storage is available
 */
export function isAudioStorageAvailable(): boolean {
  return supabase.isAvailable();
}

/**
 * Upload meeting audio to Supabase Storage
 */
export async function uploadMeetingAudio(
  buffer: Buffer,
  meetingId: string,
  mimeType: string,
  context: string
): Promise<AudioUploadResult | null> {
  const client = supabase.getClient();
  if (!client) {
    logger.warn('Supabase not available - audio will not be stored');
    return null;
  }

  const extension = getExtensionFromMime(mimeType);
  const timestamp = Date.now();
  const storagePath = `${context}/${meetingId}/${timestamp}.${extension}`;

  const { error } = await client.storage
    .from(BUCKET_NAME)
    .upload(storagePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (error) {
    logger.error('Failed to upload meeting audio', error);
    return null;
  }

  logger.info(`Meeting audio uploaded: ${storagePath} (${buffer.length} bytes)`);

  return {
    storagePath,
    sizeBytes: buffer.length,
    mimeType,
  };
}

/**
 * Get a signed URL for audio playback (1 hour expiry)
 */
export async function getSignedAudioUrl(storagePath: string): Promise<string | null> {
  const client = supabase.getClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.storage
    .from(BUCKET_NAME)
    .createSignedUrl(storagePath, SIGNED_URL_EXPIRY_SECONDS);

  if (error) {
    logger.error('Failed to create signed audio URL', error);
    return null;
  }

  return data.signedUrl;
}

/**
 * Delete audio file from storage
 */
export async function deleteMeetingAudio(storagePath: string): Promise<boolean> {
  const client = supabase.getClient();
  if (!client) {
    return false;
  }

  const { error } = await client.storage
    .from(BUCKET_NAME)
    .remove([storagePath]);

  if (error) {
    logger.error('Failed to delete meeting audio', error);
    return false;
  }

  logger.info(`Meeting audio deleted: ${storagePath}`);
  return true;
}

function getExtensionFromMime(mimeType: string): string {
  const map: Record<string, string> = {
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/wav': 'wav',
    'audio/flac': 'flac',
  };
  return map[mimeType] || 'webm';
}
