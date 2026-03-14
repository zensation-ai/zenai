/**
 * Audio Visualizer
 *
 * Canvas-based circular visualizer that pulses with audio volume.
 * Different colors for listening, processing, and speaking states.
 *
 * Phase 57: Real-Time Voice Pipeline
 */

import React, { useRef, useEffect, useCallback } from 'react';

interface AudioVisualizerProps {
  volume: number;       // 0-1
  isSpeaking: boolean;
  isProcessing: boolean;
  isConnected: boolean;
}

const COLORS = {
  idle: { r: 100, g: 100, b: 120 },
  listening: { r: 59, g: 130, b: 246 },     // blue
  processing: { r: 234, g: 179, b: 8 },     // yellow
  speaking: { r: 34, g: 197, b: 94 },       // green
  disconnected: { r: 100, g: 100, b: 100 }, // gray
};

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  volume,
  isSpeaking,
  isProcessing,
  isConnected,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number | null>(null);
  const phaseRef = useRef(0);

  const getColor = useCallback(() => {
    if (!isConnected) return COLORS.disconnected;
    if (isProcessing) return COLORS.processing;
    if (isSpeaking) return COLORS.speaking;
    if (volume > 0.02) return COLORS.listening;
    return COLORS.idle;
  }, [isConnected, isProcessing, isSpeaking, volume]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 200;
    canvas.width = size * 2; // retina
    canvas.height = size * 2;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(2, 2);

    const centerX = size / 2;
    const centerY = size / 2;
    const baseRadius = 60;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);

      const color = getColor();
      phaseRef.current += 0.02;

      // Pulse radius based on volume
      const pulseAmount = volume * 20;
      const numRings = 3;

      for (let ring = numRings; ring >= 0; ring--) {
        const ringOffset = ring * 8;
        const ringAlpha = 0.1 + (1 - ring / numRings) * 0.3;
        const waveAmplitude = pulseAmount * (1 - ring * 0.2);

        ctx.beginPath();
        for (let angle = 0; angle < Math.PI * 2; angle += 0.05) {
          const wave = Math.sin(angle * 4 + phaseRef.current + ring) * waveAmplitude;
          const r = baseRadius + ringOffset + wave;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          if (angle === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.closePath();
        ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${ringAlpha})`;
        ctx.fill();
      }

      // Inner circle
      ctx.beginPath();
      ctx.arc(centerX, centerY, baseRadius - 5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.8)`;
      ctx.fill();

      // Center icon hint
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = '28px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      if (!isConnected) {
        ctx.fillText('\u2022', centerX, centerY); // dot
      } else if (isProcessing) {
        ctx.fillText('\u2026', centerX, centerY); // ellipsis
      } else {
        ctx.fillText('\u25CF', centerX, centerY); // filled circle
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [volume, isSpeaking, isProcessing, isConnected, getColor]);

  return (
    <canvas
      ref={canvasRef}
      className="voice-chat-visualizer"
      aria-label="Audio visualizer"
    />
  );
};
