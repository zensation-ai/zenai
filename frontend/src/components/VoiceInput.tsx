/**
 * VoiceInput Component
 *
 * Compact voice recording button for chat input integration.
 * Records audio, transcribes via Whisper, and returns text.
 *
 * @module components/VoiceInput
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';
import { showToast } from './Toast';
import { getErrorMessage } from '../utils/errors';
import './VoiceInput.css';

interface VoiceInputProps {
  /** Called when transcription is complete */
  onTranscript: (text: string) => void;
  /** Recording status change callback */
  onRecordingChange?: (isRecording: boolean) => void;
  /** Disable the button */
  disabled?: boolean;
  /** Context for transcription API */
  context?: 'personal' | 'work';
  /** Compact mode (icon only) */
  compact?: boolean;
}

export function VoiceInput({
  onTranscript,
  onRecordingChange,
  disabled = false,
  context = 'personal',
  compact = true,
}: VoiceInputProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [duration, setDuration] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Notify parent of recording state changes
  useEffect(() => {
    onRecordingChange?.(recording);
  }, [recording, onRecordingChange]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Determine supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg')
          ? 'audio/ogg'
          : 'audio/mp4';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        if (!isMountedRef.current) return;

        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        processAudio(audioBlob, mimeType);

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start();
      setRecording(true);
      setDuration(0);

      // Start duration timer
      timerRef.current = window.setInterval(() => {
        if (isMountedRef.current) {
          setDuration((prev) => prev + 1);
        }
      }, 1000);
    } catch (error) {
      console.error('Failed to start recording:', error);
      showToast('Mikrofon-Zugriff verweigert', 'error');
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }

    setRecording(false);
  }, []);

  const processAudio = async (audioBlob: Blob, mimeType: string) => {
    if (!isMountedRef.current) return;

    setProcessing(true);

    try {
      // Determine file extension
      const extension = mimeType.includes('webm')
        ? 'webm'
        : mimeType.includes('ogg')
          ? 'ogg'
          : mimeType.includes('mp4')
            ? 'm4a'
            : 'wav';

      const formData = new FormData();
      formData.append('audio', audioBlob, `recording.${extension}`);
      formData.append('transcribeOnly', 'true'); // Only transcribe, don't create idea

      // Use voice-memo endpoint with transcribeOnly flag
      const response = await axios.post(`/api/${context}/voice-memo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000, // 60 second timeout for transcription
      });

      if (!isMountedRef.current) return;

      const transcript = response.data.transcript || '';

      if (transcript.trim()) {
        onTranscript(transcript);
        showToast('Spracheingabe erkannt', 'success');
      } else {
        showToast('Keine Sprache erkannt', 'error');
      }
    } catch (error) {
      if (!isMountedRef.current) return;

      console.error('Transcription failed:', error);
      showToast(getErrorMessage(error, 'Transkription fehlgeschlagen'), 'error');
    } finally {
      if (isMountedRef.current) {
        setProcessing(false);
      }
    }
  };

  const handleClick = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isDisabled = disabled || processing;

  return (
    <button
      type="button"
      className={`voice-input-btn ${recording ? 'recording' : ''} ${processing ? 'processing' : ''} ${compact ? 'compact' : ''}`}
      onClick={handleClick}
      disabled={isDisabled}
      title={
        processing
          ? 'Transkribiere...'
          : recording
            ? `Aufnahme stoppen (${formatDuration(duration)})`
            : 'Spracheingabe starten'
      }
      aria-label={
        processing
          ? 'Audio wird transkribiert'
          : recording
            ? 'Aufnahme stoppen'
            : 'Spracheingabe starten'
      }
    >
      {processing ? (
        <span className="voice-input-icon processing-icon">⏳</span>
      ) : recording ? (
        <>
          <span className="voice-input-icon recording-icon">⏹</span>
          {!compact && <span className="voice-input-duration">{formatDuration(duration)}</span>}
        </>
      ) : (
        <span className="voice-input-icon mic-icon">🎤</span>
      )}

      {/* Recording pulse animation */}
      {recording && <span className="voice-input-pulse" />}
    </button>
  );
}
