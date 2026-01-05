import { useState, useRef } from 'react';
import axios from 'axios';
import './RecordButton.css';

interface RecordButtonProps {
  onTranscript: (transcript: string) => void;
  onProcessed?: (result: ProcessedResult) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  disabled?: boolean;
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
  };
}

export function RecordButton({ onTranscript, onProcessed, onRecordingChange, disabled }: RecordButtonProps) {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

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
      console.error('Failed to start recording:', error);
      alert('Mikrofon-Zugriff verweigert. Bitte erlaube den Zugriff in den Einstellungen.');
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

      console.log(`Sending audio: ${audioBlob.size} bytes, type: ${mimeType}`);

      // Send to backend
      const response = await axios.post('/api/voice-memo', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        timeout: 300000, // 5 minute timeout for transcription
      });

      console.log('Response:', response.data);

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
        });
      }
    } catch (error: any) {
      console.error('Processing error:', error);
      const errorMessage = error.response?.data?.error || error.message;
      alert(`Fehler bei der Verarbeitung: ${errorMessage}`);
    } finally {
      setProcessing(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="record-container">
      <button
        className={`record-button ${recording ? 'recording' : ''} ${processing ? 'processing' : ''}`}
        onClick={recording ? stopRecording : startRecording}
        disabled={disabled || processing}
      >
        <span className="record-icon">
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
      {recording && <div className="recording-pulse" />}
      {processing && (
        <div className="processing-info">
          Transkribiere und strukturiere mit KI...
        </div>
      )}
    </div>
  );
}
