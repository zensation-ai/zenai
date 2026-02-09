import { useState, useRef, useEffect } from 'react';
import { AIContext } from './ContextSwitcher';
import axios from 'axios';
import { showToast } from './Toast';
import { getErrorMessage } from '../utils/errors';
import '../neurodesign.css';
import './RecordButton.css';
import { logError } from '../utils/errors';

interface RecordButtonProps {
  onTranscript: (transcript: string) => void;
  onProcessed?: (result: ProcessedResult) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  disabled?: boolean;
  context?: AIContext;
  persona?: string | null;
}

interface ProcessedResult {
  ideaId: string;
  transcript: string;
  structured: {
    title: string;
    type: string;
    category: string;
    priority: string;
    summary: string;
    next_steps?: string[];
    context_needed?: string[];
    keywords?: string[];
    suggested_context?: 'personal' | 'work' | 'learning' | 'creative';
  };
  suggestedContext?: 'personal' | 'work' | 'learning' | 'creative';
  contextConfidence?: number;
}

export function RecordButton({ onTranscript, onProcessed, onRecordingChange, disabled, context = 'personal', persona }: RecordButtonProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef<boolean>(true);

  // Cleanup on unmount to prevent memory leaks
  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;

      // Clear timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Stop media recorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }

      // Stop all tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Try to use wav format, fall back to webm
      const mimeType = MediaRecorder.isTypeSupported('audio/wav')
        ? 'audio/wav'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/ogg';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });

        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());

        // Send to backend for transcription and processing
        await processAudio(audioBlob, mimeType);
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setRecording(true);
      onRecordingChange?.(true);
      setDuration(0);

      timerRef.current = window.setInterval(() => {
        setDuration((d) => d + 1);
      }, 1000);
    } catch (error) {
      logError('RecordButton:startRecording', error);
      showToast('Mikrofon-Zugriff verweigert. Bitte erlaube den Zugriff in den Einstellungen.', 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && recording) {
      mediaRecorderRef.current.stop();
      setRecording(false);
      onRecordingChange?.(false);

      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const processAudio = async (audioBlob: Blob, mimeType: string) => {
    setProcessing(true);

    try {
      // Create form data with audio file
      const formData = new FormData();
      const extension = mimeType.includes('wav') ? 'wav' : mimeType.includes('webm') ? 'webm' : 'ogg';
      formData.append('audio', audioBlob, `recording.${extension}`);

      // Add persona if selected
      if (persona) {
        formData.append('persona', persona);
      }

      // Send to backend with context
      const response = await axios.post(`/api/${context}/voice-memo`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000, // 5 minute timeout for transcription
      });

      // Callback with transcript
      if (response.data.transcript) {
        onTranscript(response.data.transcript);
      }

      // Callback with full processed result
      if (onProcessed && response.data.success) {
        onProcessed({
          ideaId: response.data.ideaId,
          transcript: response.data.transcript,
          structured: response.data.structured,
          suggestedContext: response.data.suggestedContext,
          contextConfidence: response.data.contextConfidence,
        });
      }
    } catch (error: unknown) {
      logError('RecordButton:processRecording', error);
      const errorMessage = getErrorMessage(error, 'Unbekannter Fehler');
      if (isMountedRef.current) {
        showToast(`Verarbeitung fehlgeschlagen: ${errorMessage}`, 'error');
      }
    } finally {
      if (isMountedRef.current) {
        setProcessing(false);
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const buttonLabel = processing
    ? 'Verarbeitung laeuft'
    : recording
    ? 'Aufnahme stoppen'
    : 'Sprachmemo aufnehmen';

  return (
    <div className="record-container">
      <button
        className={`record-button neuro-button neuro-focus-ring ${recording ? 'recording' : ''} ${processing ? 'processing' : ''}`}
        onClick={recording ? stopRecording : startRecording}
        disabled={disabled || processing}
        aria-label={buttonLabel}
      >
        <span className="record-icon" aria-hidden="true">
          {processing ? '⏳' : recording ? '⏹️' : '🎤'}
        </span>
        <span className="record-text">
          {processing
            ? 'Verarbeite...'
            : recording
            ? `Aufnahme... ${formatDuration(duration)}`
            : 'Sprachmemo aufnehmen'}
        </span>
      </button>
      {recording && <div className="recording-pulse" aria-hidden="true" />}
      {processing && (
        <div className="processing-info" role="status" aria-live="polite">
          Transkribiere und strukturiere mit KI...
        </div>
      )}
    </div>
  );
}
