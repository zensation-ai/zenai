/**
 * Voice Activity Detection Hook
 *
 * Uses Web Audio API AnalyserNode for real-time volume monitoring.
 * Detects speech based on volume threshold.
 *
 * Phase 57: Real-Time Voice Pipeline
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export interface UseVoiceActivityOptions {
  stream: MediaStream | null;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  volumeThreshold?: number;
}

export interface UseVoiceActivityReturn {
  isSpeaking: boolean;
  volume: number; // 0-1 normalized
}

export function useVoiceActivity(options: UseVoiceActivityOptions): UseVoiceActivityReturn {
  const { stream, onSpeechStart, onSpeechEnd, volumeThreshold = 0.02 } = options;

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [volume, setVolume] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const callbacksRef = useRef({ onSpeechStart, onSpeechEnd });
  callbacksRef.current = { onSpeechStart, onSpeechEnd };

  const cleanup = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    if (!stream) {
      cleanup();
      setVolume(0);
      setIsSpeaking(false);
      return;
    }

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;

    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteTimeDomainData(dataArray);

      // Calculate RMS volume
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const clampedVolume = Math.min(1, rms);

      setVolume(clampedVolume);

      const speaking = clampedVolume > volumeThreshold;
      if (speaking && !isSpeakingRef.current) {
        isSpeakingRef.current = true;
        setIsSpeaking(true);
        callbacksRef.current.onSpeechStart?.();
      } else if (!speaking && isSpeakingRef.current) {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
        callbacksRef.current.onSpeechEnd?.();
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      cleanup();
    };
  }, [stream, volumeThreshold, cleanup]);

  return { isSpeaking, volume };
}
