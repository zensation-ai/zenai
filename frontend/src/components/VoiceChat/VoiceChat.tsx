/**
 * Voice Chat Component
 *
 * Full voice chat UI with WebSocket connection, audio capture,
 * real-time transcript display, and TTS audio playback.
 *
 * Phase 57: Real-Time Voice Pipeline
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AudioVisualizer } from './AudioVisualizer';
import { useWebRTC } from '../../hooks/useWebRTC';
import { useVoiceActivity } from '../../hooks/useVoiceActivity';
import './VoiceChat.css';

interface VoiceChatProps {
  context?: string;
  onClose?: () => void;
  embedded?: boolean;
}

interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
}

type VoiceChatState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking';

export const VoiceChat: React.FC<VoiceChatProps> = ({
  context = 'personal',
  onClose,
  embedded = false,
}) => {
  const [state, setState] = useState<VoiceChatState>('idle');
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioQueueRef = useRef<ArrayBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Voice activity detection
  const { isSpeaking: localSpeaking, volume } = useVoiceActivity({
    stream: mediaStreamRef.current,
  });

  // WebSocket connection
  const {
    isConnected,
    sessionId,
    connect,
    disconnect,
    sendAudio,
  } = useWebRTC({
    context,
    onTranscript: useCallback((text: string) => {
      if (text.trim()) {
        setTranscript((prev) => [
          ...prev,
          { role: 'user', text, timestamp: Date.now() },
        ]);
      }
      setState('processing');
    }, []),
    onResponseText: useCallback((text: string) => {
      setTranscript((prev) => [
        ...prev,
        { role: 'assistant', text, timestamp: Date.now() },
      ]);
    }, []),
    onResponseAudio: useCallback((audio: ArrayBuffer) => {
      audioQueueRef.current.push(audio);
      playNextAudio();
    }, []),
    onVAD: useCallback((_isSpeaking: boolean, _volume: number) => {
      // Server-side VAD feedback (optional)
    }, []),
    onError: useCallback((errorMsg: string) => {
      setError(errorMsg);
      setTimeout(() => setError(null), 5000);
    }, []),
    onSessionStart: useCallback((_sid: string) => {
      setState('listening');
    }, []),
  });

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // Play audio queue
  const playNextAudio = useCallback(() => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) return;

    isPlayingRef.current = true;
    setState('speaking');

    const audioData = audioQueueRef.current.shift();
    if (!audioData) {
      isPlayingRef.current = false;
      setState('listening');
      return;
    }

    const blob = new Blob([audioData], { type: 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) {
        playNextAudio();
      } else {
        setState('listening');
      }
    };

    audio.onerror = () => {
      URL.revokeObjectURL(url);
      isPlayingRef.current = false;
      if (audioQueueRef.current.length > 0) {
        playNextAudio();
      } else {
        setState('listening');
      }
    };

    audio.play().catch(() => {
      URL.revokeObjectURL(url);
      isPlayingRef.current = false;
      setState('listening');
    });
  }, []);

  // Start recording
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      });

      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : 'audio/webm',
      });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0 && !isMuted) {
          event.data.arrayBuffer().then((buffer) => {
            sendAudio(buffer);
          });
        }
      };

      // Send audio chunks every 250ms
      recorder.start(250);
      mediaRecorderRef.current = recorder;
    } catch (err) {
      setError('Microphone access denied');
      setState('idle');
    }
  }, [sendAudio, isMuted]);

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
  }, []);

  // Connect and start
  const handleStart = useCallback(async () => {
    setState('connecting');
    setError(null);

    try {
      await connect();
      await startRecording();
    } catch (err) {
      setError('Connection failed. Please try again.');
      setState('idle');
    }
  }, [connect, startRecording]);

  // Disconnect and stop
  const handleStop = useCallback(() => {
    stopRecording();
    disconnect();
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    setState('idle');
  }, [stopRecording, disconnect]);

  // Toggle mute
  const handleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = isMuted; // toggle (current isMuted is the old value)
      });
    }
  }, [isMuted]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
      disconnect();
    };
  }, [stopRecording, disconnect]);

  const getStatusText = () => {
    switch (state) {
      case 'idle': return 'Tippe zum Sprechen';
      case 'connecting': return 'Verbinde...';
      case 'listening': return isMuted ? 'Stummgeschaltet' : 'Ich h\u00f6re zu...';
      case 'processing': return 'Denke nach...';
      case 'speaking': return 'Antworte...';
      default: return '';
    }
  };

  const containerClass = embedded
    ? 'voice-chat-container voice-chat-embedded'
    : 'voice-chat-container voice-chat-overlay';

  return (
    <div className={containerClass}>
      {/* Header */}
      <div className="voice-chat-header">
        <h3 className="voice-chat-title">Sprach-Chat</h3>
        {onClose && (
          <button className="voice-chat-close" onClick={onClose} aria-label="Schlie\u00dfen">
            &times;
          </button>
        )}
      </div>

      {/* Visualizer Area */}
      <div className="voice-chat-visualizer-area">
        <AudioVisualizer
          volume={localSpeaking ? volume : 0}
          isSpeaking={state === 'listening' && localSpeaking}
          isProcessing={state === 'processing'}
          isConnected={isConnected}
        />
        <div className={`voice-chat-status voice-chat-status-${state}`}>
          {getStatusText()}
        </div>
      </div>

      {/* Controls */}
      <div className="voice-chat-controls">
        {state === 'idle' ? (
          <button
            className="voice-chat-mic-button voice-chat-mic-start"
            onClick={handleStart}
            aria-label="Sprach-Chat starten"
          >
            <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </button>
        ) : (
          <>
            <button
              className={`voice-chat-control-btn ${isMuted ? 'voice-chat-muted' : ''}`}
              onClick={handleMute}
              aria-label={isMuted ? 'Mikrofon aktivieren' : 'Stummschalten'}
            >
              {isMuted ? (
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.55-.9l4.18 4.18L21 19.73 4.27 3z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>
              )}
            </button>

            <button
              className="voice-chat-mic-button voice-chat-mic-stop"
              onClick={handleStop}
              aria-label="Sprach-Chat beenden"
            >
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="voice-chat-error">
          {error}
        </div>
      )}

      {/* Transcript Panel */}
      {transcript.length > 0 && (
        <div className="voice-chat-transcript">
          {transcript.map((entry, index) => (
            <div
              key={index}
              className={`voice-chat-transcript-entry voice-chat-transcript-${entry.role}`}
            >
              <span className="voice-chat-transcript-role">
                {entry.role === 'user' ? 'Du' : 'ZenAI'}
              </span>
              <p className="voice-chat-transcript-text">{entry.text}</p>
            </div>
          ))}
          <div ref={transcriptEndRef} />
        </div>
      )}

      {/* Session Info */}
      {sessionId && (
        <div className="voice-chat-session-info">
          Session: {sessionId.slice(0, 8)}...
        </div>
      )}
    </div>
  );
};

export default VoiceChat;
