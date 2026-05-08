interface AmbientGlowProps {
  state?: 'idle' | 'thinking' | 'active' | 'complete';
  className?: string;
}

export function AmbientGlow({ state = 'idle', className = '' }: AmbientGlowProps) {
  return (
    <div className={`ambient-glow ambient-glow--${state} ${className}`} aria-hidden="true">
      <div className="ambient-glow__primary" />
      <div className="ambient-glow__secondary" />
    </div>
  );
}
