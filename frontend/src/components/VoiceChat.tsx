/**
 * VoiceChat Component
 *
 * Real-time voice conversation interface.
 * State machine: IDLE → LISTENING → PROCESSING → SPEAKING → LISTENING
 *
 * Phase 33 Sprint 4 - Feature 9
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useVAD } from '../hooks/useVAD';
import { useVoicePipeline } from '../hooks/useVoicePipeline';
import { StreamingAudioPlayer } from '../utils/audioPlayer';
import './VoiceChat.css';

type VoiceState = 'idle' | 'connecting' | 'listening' | 'processing' | 'speaking';

interface VoiceChatProps {
  context: string;
  apiUrl: string;
  apiKey: string;
  onClose?: () => void;
}

interface ConversationEntry {
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
}

export function VoiceChat({ context: _context, apiUrl, apiKey, onClose }: VoiceChatProps) {
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [conversation, setConversation] = useState<ConversationEntry[]>([]);
  const [currentTranscript, setCurrentTranscript] = useState('');
  const [currentResponse, setCurrentResponse] = useState('');
  const [error, setError] = useState<string | null>(null);

  const audioPlayerRef = useRef<StreamingAudioPlayer | null>(null);
  const conversationEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize audio player
  useEffect(() => {
    audioPlayerRef.current = new StreamingAudioPlayer(() => {
      setVoiceState('listening');
    });
    return () => {
      audioPlayerRef.current?.close();
    };
  }, []);

  // Auto-scroll conversation
  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversation, currentTranscript, currentResponse]);

  // Voice Pipeline WebSocket
  const pipeline = useVoicePipeline({
    apiUrl,
    apiKey,
    onTranscription: useCallback((text: string) => {
      setCurrentTranscript(text);
      setConversation((prev) => [...prev, { role: 'user', text, timestamp: new Date() }]);
      setVoiceState('processing');
    }, []),
    onClaudeText: useCallback((text: string) => {
      setCurrentResponse(text);
      setConversation((prev) => [...prev, { role: 'assistant', text, timestamp: new Date() }]);
      setVoiceState('speaking');
    }, []),
    onAudioChunk: useCallback((data: ArrayBuffer) => {
      audioPlayerRef.current?.queueChunk(data);
    }, []),
    onAudioEnd: useCallback(() => {
      setCurrentTranscript('');
      setCurrentResponse('');
    }, []),
    onError: useCallback((msg: string) => {
      setError(msg);
      setVoiceState('listening');
      setTimeout(() => setError(null), 5000);
    }, []),
  });

  // Voice Activity Detection
  const vad = useVAD({
    onSpeechStart: useCallback(() => {
      setCurrentTranscript('');
      setCurrentResponse('');
      // Interrupt any ongoing TTS
      if (voiceState === 'speaking') {
        audioPlayerRef.current?.stop();
        pipeline.interrupt();
      }
    }, [voiceState, pipeline]),
    onSpeechEnd: useCallback((audioBlob: Blob) => {
      pipeline.sendAudio(audioBlob);
    }, [pipeline]),
    silenceDurationMs: 1500,
  });

  // Start voice conversation
  const handleStart = useCallback(async () => {
    setVoiceState('connecting');
    setError(null);
    try {
      pipeline.connect();
      await vad.start();
      setVoiceState('listening');
    } catch (err) {
      setError('Mikrofonzugriff verweigert');
      setVoiceState('idle');
    }
  }, [pipeline, vad]);

  // Stop voice conversation
  const handleStop = useCallback(() => {
    vad.stop();
    pipeline.disconnect();
    audioPlayerRef.current?.stop();
    setVoiceState('idle');
    setCurrentTranscript('');
    setCurrentResponse('');
  }, [vad, pipeline]);

  const getStateLabel = (): string => {
    switch (voiceState) {
      case 'idle': return 'Bereit';
      case 'connecting': return 'Verbinde...';
      case 'listening': return 'Ich h\u00f6re zu...';
      case 'processing': return 'Denke nach...';
      case 'speaking': return 'Spricht...';
      default: return 'Bereit';
    }
  };

  const getStateIcon = (): string => {
    switch (voiceState) {
      case 'idle': return '\uD83C\uDFA4';
      case 'connecting': return '\u23F3';
      case 'listening': return '\uD83D\uDD34';
      case 'processing': return '\uD83E\uDDE0';
      case 'speaking': return '\uD83D\uDD0A';
      default: return '\uD83C\uDFA4';
    }
  };

  return (
    <div className="voice-chat">
      <div className="voice-chat-header">
        <h3>Sprachkonversation</h3>
        {onClose && (
          <button className="voice-chat-close" onClick={onClose} aria-label="Schlie\u00dfen">
            \u2715
          </button>
        )}
      </div>

      {/* Conversation History */}
      <div className="voice-chat-conversation">
        {conversation.length === 0 && voiceState === 'idle' && (
          <div className="voice-chat-empty">
            Starte eine Sprachkonversation mit ZenAI.
            Dr\u00fccke den Mikrofon-Button um zu beginnen.
          </div>
        )}

        {conversation.map((entry, index) => (
          <div key={index} className={`voice-chat-message voice-chat-message-${entry.role}`}>
            <span className="voice-chat-message-role">
              {entry.role === 'user' ? 'Du' : 'ZenAI'}
            </span>
            <p className="voice-chat-message-text">{entry.text}</p>
          </div>
        ))}

        {/* Current processing state */}
        {currentTranscript && voiceState === 'processing' && (
          <div className="voice-chat-message voice-chat-message-user voice-chat-message-current">
            <span className="voice-chat-message-role">Du</span>
            <p className="voice-chat-message-text">{currentTranscript}</p>
          </div>
        )}

        {currentResponse && voiceState === 'speaking' && (
          <div className="voice-chat-message voice-chat-message-assistant voice-chat-message-current">
            <span className="voice-chat-message-role">ZenAI</span>
            <p className="voice-chat-message-text">{currentResponse}</p>
          </div>
        )}

        <div ref={conversationEndRef} />
      </div>

      {/* Error display */}
      {error && (
        <div className="voice-chat-error">{error}</div>
      )}

      {/* Audio level indicator */}
      {vad.isListening && (
        <div className="voice-chat-level">
          <div
            className="voice-chat-level-bar"
            style={{ width: `${Math.min(vad.audioLevel * 500, 100)}%` }}
          />
        </div>
      )}

      {/* Controls */}
      <div className="voice-chat-controls">
        <div className="voice-chat-status">
          <span className="voice-chat-status-icon">{getStateIcon()}</span>
          <span className="voice-chat-status-label">{getStateLabel()}</span>
        </div>

        {voiceState === 'idle' ? (
          <button
            className="voice-chat-button voice-chat-button-start"
            onClick={handleStart}
            aria-label="Sprachkonversation starten"
          >
            {'\uD83C\uDFA4'} Starten
          </button>
        ) : (
          <button
            className="voice-chat-button voice-chat-button-stop"
            onClick={handleStop}
            aria-label="Sprachkonversation beenden"
          >
            {'\u23F9'} Beenden
          </button>
        )}
      </div>
    </div>
  );
}
