/**
 * Voice Pipeline Hook
 *
 * Manages WebSocket connection to the voice pipeline backend.
 * Handles sending audio data and receiving transcription, Claude text, and TTS audio.
 *
 * Phase 33 Sprint 4 - Feature 9
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export interface UseVoicePipelineOptions {
  apiUrl: string;
  apiKey: string;
  voice?: string;
  onTranscription?: (text: string) => void;
  onClaudeText?: (text: string) => void;
  onAudioChunk?: (data: ArrayBuffer) => void;
  onAudioEnd?: () => void;
  onError?: (error: string) => void;
}

export interface UseVoicePipelineReturn {
  connect: () => void;
  disconnect: () => void;
  sendAudio: (audioData: Blob) => void;
  interrupt: () => void;
  isConnected: boolean;
  isProcessing: boolean;
  sessionId: string | null;
}

interface ServerMessage {
  type: string;
  sessionId?: string;
  text?: string;
  durationMs?: number;
  message?: string;
  code?: string;
  metrics?: Record<string, number>;
}

export function useVoicePipeline(options: UseVoicePipelineOptions): UseVoicePipelineReturn {
  const { apiUrl, apiKey, voice, onTranscription, onClaudeText, onAudioChunk, onAudioEnd, onError } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      wsRef.current?.close();
    };
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Build WebSocket URL
    const wsUrl = apiUrl
      .replace(/^http/, 'ws')
      .replace(/\/$/, '');
    const url = `${wsUrl}/api/voice/pipeline?apiKey=${encodeURIComponent(apiKey)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      if (!isMountedRef.current) return;
      setIsConnected(true);

      // Send initial config
      if (voice) {
        ws.send(JSON.stringify({ type: 'config', voice }));
      }
    };

    ws.onmessage = (event) => {
      if (!isMountedRef.current) return;

      // Binary data = TTS audio chunk
      if (event.data instanceof ArrayBuffer) {
        onAudioChunk?.(event.data);
        return;
      }

      // Text data = JSON control message
      try {
        const msg: ServerMessage = JSON.parse(event.data);

        switch (msg.type) {
          case 'session_start':
            setSessionId(msg.sessionId ?? null);
            break;

          case 'transcription':
            setIsProcessing(true);
            onTranscription?.(msg.text ?? '');
            break;

          case 'claude_text':
            onClaudeText?.(msg.text ?? '');
            break;

          case 'audio_end':
            onAudioEnd?.();
            break;

          case 'turn_complete':
            setIsProcessing(false);
            break;

          case 'error':
            setIsProcessing(false);
            onError?.(msg.message ?? 'Unknown error');
            break;

          case 'pong':
            // Heartbeat response
            break;
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      if (!isMountedRef.current) return;
      setIsConnected(false);
      setIsProcessing(false);
      setSessionId(null);
    };

    ws.onerror = () => {
      if (!isMountedRef.current) return;
      onError?.('WebSocket connection error');
    };
  }, [apiUrl, apiKey, voice, onTranscription, onClaudeText, onAudioChunk, onAudioEnd, onError]);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
    setIsConnected(false);
    setIsProcessing(false);
    setSessionId(null);
  }, []);

  const sendAudio = useCallback(async (audioBlob: Blob) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;

    // Send audio as binary
    const arrayBuffer = await audioBlob.arrayBuffer();
    ws.send(arrayBuffer);

    // Signal end of audio
    ws.send(JSON.stringify({ type: 'audio_end' }));
  }, []);

  const interrupt = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'interrupt' }));
    setIsProcessing(false);
  }, []);

  return {
    connect,
    disconnect,
    sendAudio,
    interrupt,
    isConnected,
    isProcessing,
    sessionId,
  };
}
