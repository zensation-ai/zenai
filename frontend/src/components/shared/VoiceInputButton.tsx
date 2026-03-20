/**
 * VoiceInputButton - Reusable toolbar mic button
 *
 * A compact microphone button that can be dropped into any toolbar.
 * Records audio via MediaRecorder, sends to backend for transcription,
 * and returns the transcript text via callback.
 *
 * Phase 116: Voice Experience
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Loader } from 'lucide-react';
import { AIContext } from '../ContextSwitcher';
import axios from 'axios';
import './VoiceInputButton.css';

interface VoiceInputButtonProps {
  /** Called when transcription completes */
  onTranscript: (text: string) => void;
  /** Button size variant */
  size?: 'sm' | 'md';
  /** Additional CSS class */
  className?: string;
  /** AI context for API calls */
  context?: AIContext;
  /** Disable the button */
  disabled?: boolean;
}

export function VoiceInputButton({
  onTranscript,
  size = 'sm',
  className = '',
  context = 'personal',
  disabled = false,
}: VoiceInputButtonProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (mediaRecorderRef.current?.state !== 'inactive') {
        mediaRecorderRef.current?.stop();
      }
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  const processAudio = useCallback(async (blob: Blob, mimeType: string) => {
    if (!isMountedRef.current) return;
    setProcessing(true);

    try {
      const ext = mimeType.includes('webm') ? 'webm'
        : mimeType.includes('ogg') ? 'ogg'
        : mimeType.includes('mp4') ? 'm4a' : 'wav';

      const formData = new FormData();
      formData.append('audio', blob, `recording.${ext}`);
      formData.append('transcribeOnly', 'true');

      const response = await axios.post(`/api/${context}/voice-memo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 60000,
      });

      if (!isMountedRef.current) return;

      const transcript = response.data.transcript || '';
      if (transcript.trim()) {
        onTranscript(transcript.trim());
      }
    } catch {
      // Silently fail - toolbar voice is a convenience feature
    } finally {
      if (isMountedRef.current) {
        setProcessing(false);
      }
    }
  }, [context, onTranscript]);

  const startRecording = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isMountedRef.current) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/ogg') ? 'audio/ogg' : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        if (!isMountedRef.current) return;
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        processAudio(audioBlob, mimeType);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setRecording(true);
    } catch {
      // Mic access denied - silently ignore
    }
  }, [processAudio]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    setRecording(false);
  }, []);

  const handleClick = () => {
    if (recording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const isDisabled = disabled || processing;
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <button
      type="button"
      className={`voice-input-toolbar-btn voice-input-toolbar-btn--${size} ${recording ? 'voice-input-toolbar-btn--recording' : ''} ${processing ? 'voice-input-toolbar-btn--processing' : ''} ${className}`}
      onClick={handleClick}
      disabled={isDisabled}
      title={processing ? 'Transkribiere...' : recording ? 'Aufnahme stoppen' : 'Spracheingabe'}
      aria-label={processing ? 'Audio wird transkribiert' : recording ? 'Aufnahme stoppen' : 'Spracheingabe starten'}
    >
      {processing ? (
        <Loader size={iconSize} className="voice-input-toolbar-btn__spinner" />
      ) : recording ? (
        <MicOff size={iconSize} />
      ) : (
        <Mic size={iconSize} />
      )}
      {recording && <span className="voice-input-toolbar-btn__pulse" />}
    </button>
  );
}
