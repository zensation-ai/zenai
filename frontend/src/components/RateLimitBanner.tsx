/**
 * Phase 7.4: Rate Limit Banner Component
 *
 * Displays a non-intrusive banner when the user is approaching or has hit
 * the API rate limit. Shows a countdown timer when rate-limited.
 */

import { memo } from 'react';
import { useRateLimitFeedback } from '../hooks/useRateLimitFeedback';

export const RateLimitBanner = memo(function RateLimitBanner() {
  const { rateLimitInfo, isNearLimit, isLimited, retryCountdown } = useRateLimitFeedback();

  // Don't render if no rate limit concerns
  if (!isNearLimit && !isLimited) {
    return null;
  }

  if (isLimited) {
    return (
      <div
        className="rate-limit-banner rate-limit-blocked"
        role="alert"
        aria-live="assertive"
      >
        <span className="rate-limit-icon" aria-hidden="true">
          {'\u23F3'}
        </span>
        <span className="rate-limit-message">
          Anfrage-Limit erreicht.
          {retryCountdown > 0 && (
            <> Erneut m&ouml;glich in <strong>{retryCountdown}s</strong></>
          )}
        </span>
      </div>
    );
  }

  // Near limit warning
  return (
    <div
      className="rate-limit-banner rate-limit-warning"
      role="status"
      aria-live="polite"
    >
      <span className="rate-limit-icon" aria-hidden="true">
        {'\u26A0'}
      </span>
      <span className="rate-limit-message">
        {rateLimitInfo?.remaining}/{rateLimitInfo?.limit} Anfragen verbleibend
      </span>
    </div>
  );
});
