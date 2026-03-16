import { logger } from '../utils/logger';

/**
 * Validates environment variables and exits in production if critical ones are missing.
 */
export function validateEnvironmentVariables(): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const warnings: string[] = [];

  if (process.env.ENABLE_CODE_EXECUTION) {
    const value = process.env.ENABLE_CODE_EXECUTION.toLowerCase();
    if (value !== 'true' && value !== 'false') {
      warnings.push(`ENABLE_CODE_EXECUTION should be 'true' or 'false', got '${value}'`);
    }
  }
  if (process.env.CODE_EXECUTION_TIMEOUT) {
    const timeout = parseInt(process.env.CODE_EXECUTION_TIMEOUT, 10);
    if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
      warnings.push('CODE_EXECUTION_TIMEOUT should be between 1000 and 300000 ms');
    }
  }
  if (process.env.CODE_EXECUTION_MEMORY_LIMIT) {
    const limit = process.env.CODE_EXECUTION_MEMORY_LIMIT;
    if (!/^\d+[kmg]?$/i.test(limit)) {
      warnings.push(`CODE_EXECUTION_MEMORY_LIMIT '${limit}' is not a valid memory limit (e.g., '256m', '1g')`);
    }
  }
  if (isProduction && process.env.ENABLE_CODE_EXECUTION === 'true') {
    if (!process.env.JUDGE0_API_KEY) {
      warnings.push('JUDGE0_API_KEY is required for code execution in production');
    }
  }
  if (isProduction && process.env.SLACK_CLIENT_ID && !process.env.SLACK_SIGNING_SECRET) {
    warnings.push('SLACK_SIGNING_SECRET is required in production when Slack integration is enabled');
  }
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_WEBHOOK_SECRET) {
    warnings.push('STRIPE_WEBHOOK_SECRET recommended when STRIPE_SECRET_KEY is set');
  }
  if (process.env.GA4_PROPERTY_ID && !process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    warnings.push('GOOGLE_SERVICE_ACCOUNT_KEY required for GA4 analytics when GA4_PROPERTY_ID is set');
  }
  if (process.env.GOOGLE_CLIENT_ID && !process.env.GOOGLE_CLIENT_SECRET) {
    warnings.push('GOOGLE_CLIENT_SECRET required when GOOGLE_CLIENT_ID is set');
  }

  if (warnings.length > 0) {
    logger.warn('Environment validation warnings', { warnings });
    if (isProduction) {
      const fatalWarnings = warnings.filter(w =>
        w.includes('required') || w.includes('JUDGE0') || w.includes('SLACK_SIGNING_SECRET')
      );
      if (fatalWarnings.length > 0) {
        logger.error('FATAL: Required environment variables missing in production');
        fatalWarnings.forEach(w => logger.error(`  - ${w}`));
        process.exit(1);
      }
    }
  }

  logger.info('Environment validation complete', { production: isProduction, warnings: warnings.length });
}
