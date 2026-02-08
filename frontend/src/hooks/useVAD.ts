/**
 * Voice Activity Detection Hook
 *
 * Uses the Web Audio API to detect speech onset/offset in the microphone stream.
 * Energy-threshold based approach: monitors audio level and triggers
 * callbacks when speech starts or stops.
 *
 * Phase 33 Sprint 4 - Feature 9
 */

import { useState, useRef, useCallback } from 'react';

export interface UseVADOptions {
  onSpeechStart: () => void;
  onSpeechEnd: (audioData: Blob) => void;
  energyThreshold?: number;
  silenceDurationMs?: number;
}

export interface UseVADReturn {
  start: () => Promise<void>;
  stop: () => void;
  isListening: boolean;
  isSpeaking: boolean;
  audioLevel: number;
}

const DEFAULT_ENERGY_THRESHOLD = 0.015;
const DEFAULT_SILENCE_DURATION_MS = 1500;
const ANALYSIS_INTERVAL_MS = 100;

export function useVAD(options: UseVADOptions): UseVADReturn {
  const { onSpeechStart, onSpeechEnd } = options;
  const energyThreshold = options.energyThreshold ?? DEFAULT_ENERGY_THRESHOLD;
  const silenceDurationMs = options.silenceDurationMs ?? DEFAULT_SILENCE_DURATION_MS;

  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const isSpeakingRef = useRef(false);
  const chunksRef = useRef<Blob[]>([]);
  const isMountedRef = useRef(true);

  const start = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Setup AudioContext for level analysis
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Setup MediaRecorder for capturing audio
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (chunksRef.current.length > 0 && isMountedRef.current) {
          const blob = new Blob(chunksRef.current, { type: mimeType });
          chunksRef.current = [];
          onSpeechEnd(blob);
        }
      };

      // Start analyzing audio levels
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      intervalRef.current = setInterval(() => {
        if (!isMountedRef.current) return;

        analyser.getByteFrequencyData(dataArray);

        // Calculate RMS energy
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = dataArray[i] / 255;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setAudioLevel(rms);

        const isAboveThreshold = rms > energyThreshold;

        if (isAboveThreshold && !isSpeakingRef.current) {
          // Speech started
          isSpeakingRef.current = true;
          silenceStartRef.current = null;
          setIsSpeaking(true);
          onSpeechStart();

          // Start recording
          if (recorder.state === 'inactive') {
            chunksRef.current = [];
            recorder.start(100); // Collect chunks every 100ms
          }
        } else if (!isAboveThreshold && isSpeakingRef.current) {
          // Below threshold while speaking - start silence timer
          if (silenceStartRef.current === null) {
            silenceStartRef.current = Date.now();
          } else if (Date.now() - silenceStartRef.current > silenceDurationMs) {
            // Silence duration exceeded - speech ended
            isSpeakingRef.current = false;
            silenceStartRef.current = null;
            setIsSpeaking(false);

            // Stop recording (triggers onstop → onSpeechEnd)
            if (recorder.state === 'recording') {
              recorder.stop();
            }
          }
        } else if (isAboveThreshold && isSpeakingRef.current) {
          // Reset silence timer while still speaking
          silenceStartRef.current = null;
        }
      }, ANALYSIS_INTERVAL_MS);

      setIsListening(true);
    } catch (error) {
      throw error;
    }
  }, [energyThreshold, silenceDurationMs, onSpeechStart, onSpeechEnd]);

  const stop = useCallback(() => {
    // Stop analysis interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Stop MediaRecorder
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    mediaRecorderRef.current = null;

    // Stop audio context
    if (audioContextRef.current?.state !== 'closed') {
      audioContextRef.current?.close();
    }
    audioContextRef.current = null;
    analyserRef.current = null;

    // Stop media stream
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    isSpeakingRef.current = false;
    silenceStartRef.current = null;
    setIsListening(false);
    setIsSpeaking(false);
    setAudioLevel(0);
  }, []);

  return { start, stop, isListening, isSpeaking, audioLevel };
}
