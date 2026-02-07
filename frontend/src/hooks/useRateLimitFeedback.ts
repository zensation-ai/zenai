/**
 * Phase 7.4: Rate Limit Feedback Hook
 *
 * Subscribes to rate limit header updates from the API resilience layer
 * and provides reactive state for UI display including countdown timer.
 *
 * Usage:
 *   const { rateLimitInfo, isNearLimit, isLimited, retryCountdown } = useRateLimitFeedback();
 */

import { useState, useEffect, useRef } from 'react';
import { onRateLimitUpdate, type RateLimitInfo } from '../utils/apiResilience';

export interface RateLimitFeedbackState {
  /** Current rate limit info from last response header */
  rateLimitInfo: RateLimitInfo | null;
  /** True when remaining requests are <= 20% of limit */
  isNearLimit: boolean;
  /** True when remaining is 0 */
  isLimited: boolean;
  /** Seconds until rate limit resets (counts down live) */
  retryCountdown: number;
}

/**
 * Near-limit threshold as a fraction of the total limit.
 * When remaining/limit <= this value, isNearLimit becomes true.
 */
const NEAR_LIMIT_THRESHOLD = 0.2;

export function useRateLimitFeedback(): RateLimitFeedbackState {
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Subscribe to rate limit updates from the resilience layer
  useEffect(() => {
    const unsubscribe = onRateLimitUpdate((info) => {
      setRateLimitInfo(info);

      // Start countdown if we're rate-limited (remaining = 0)
      if (info && info.remaining <= 0) {
        const secondsUntilReset = Math.max(
          0,
          Math.ceil((info.resetAt.getTime() - Date.now()) / 1000),
        );
        setRetryCountdown(secondsUntilReset);
      } else {
        setRetryCountdown(0);
      }
    });

    return unsubscribe;
  }, []);

  // Live countdown timer
  useEffect(() => {
    if (retryCountdown <= 0) {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
      return;
    }

    countdownRef.current = setInterval(() => {
      setRetryCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) {
            clearInterval(countdownRef.current);
            countdownRef.current = null;
          }
          // Reset rate limit info when countdown expires
          setRateLimitInfo(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
        countdownRef.current = null;
      }
    };
  }, [retryCountdown > 0]); // Only re-run when transitioning to/from counting

  const isNearLimit = rateLimitInfo
    ? rateLimitInfo.remaining / rateLimitInfo.limit <= NEAR_LIMIT_THRESHOLD
    : false;

  const isLimited = rateLimitInfo ? rateLimitInfo.remaining <= 0 : false;

  return {
    rateLimitInfo,
    isNearLimit,
    isLimited,
    retryCountdown,
  };
}
