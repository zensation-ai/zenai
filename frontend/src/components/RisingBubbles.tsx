/**
 * RisingBubbles - Animated ambient background bubbles
 *
 * Renders gently rising glass-like bubbles from bottom to top.
 * When the parent has the CSS class `ai-active`, bubbles switch
 * to a faster neural-pulse animation with glow effects.
 *
 * Usage:
 *   <div className={`my-page${isAIActive ? ' ai-active' : ''}`}>
 *     <RisingBubbles variant="full" />
 *     ...content...
 *   </div>
 *
 * Variants:
 *   - "full" (default): 3 blobs + 10 bubbles (for main pages)
 *   - "subtle": 2 blobs + 6 bubbles (for secondary/hub pages)
 */

import { memo } from 'react';
import './RisingBubbles.css';

interface RisingBubblesProps {
  /** "full" = 3 blobs + 10 bubbles, "subtle" = 2 blobs + 6 bubbles */
  variant?: 'full' | 'subtle';
}

const RisingBubblesComponent: React.FC<RisingBubblesProps> = ({ variant = 'full' }) => {
  return (
    <div className={`rising-bubbles rising-bubbles--${variant}`} aria-hidden="true">
      {/* Ambient blobs */}
      <div className="rb-blob rb-blob-1" />
      <div className="rb-blob rb-blob-2" />
      {variant === 'full' && <div className="rb-blob rb-blob-3" />}

      {/* Rising bubbles */}
      <div className="rb-bubble rb-bubble-1" />
      <div className="rb-bubble rb-bubble-2" />
      <div className="rb-bubble rb-bubble-3" />
      <div className="rb-bubble rb-bubble-4" />
      <div className="rb-bubble rb-bubble-5" />
      <div className="rb-bubble rb-bubble-6" />
      {variant === 'full' && (
        <>
          <div className="rb-bubble rb-bubble-7" />
          <div className="rb-bubble rb-bubble-8" />
          <div className="rb-bubble rb-bubble-9" />
          <div className="rb-bubble rb-bubble-10" />
        </>
      )}
    </div>
  );
};

export const RisingBubbles = memo(RisingBubblesComponent);
export default RisingBubbles;
