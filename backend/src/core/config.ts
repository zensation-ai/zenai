import { z } from 'zod';

const configSchema = z.object({
  // Server
  port: z.coerce.number().default(3000),
  nodeEnv: z.string().default('development'),
  apiUrl: z.string().optional(),
  frontendUrl: z.string().optional(),
  allowedOrigins: z.string().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Database
  database: z.object({
    url: z.string().min(1, 'DATABASE_URL is required'),
    poolMax: z.coerce.number().default(8),
    poolMin: z.coerce.number().default(2),
    sslRejectUnauthorized: z.coerce.boolean().default(true),
    slowQueryThreshold: z.coerce.number().default(300),
  }),

  // AI
  ai: z.object({
    anthropicApiKey: z.string().min(1, 'ANTHROPIC_API_KEY is required'),
    claudeModel: z.string().default('claude-sonnet-4-20250514'),
    maxTokens: z.coerce.number().default(4096),
    openaiApiKey: z.string().optional(),
    ollamaUrl: z.string().optional(),
  }),

  // Redis
  redis: z.object({
    url: z.string().optional(),
  }),

  // Optional Services
  braveSearchApiKey: z.string().optional(),
  judge0ApiKey: z.string().optional(),
  githubToken: z.string().optional(),
  resendApiKey: z.string().optional(),
  stripeSecretKey: z.string().optional(),
  sentryDsn: z.string().optional(),
  jwtSecret: z.string().optional(),
  encryptionKey: z.string().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(): AppConfig {
  return configSchema.parse({
    port: process.env.PORT,
    nodeEnv: process.env.NODE_ENV,
    apiUrl: process.env.API_URL,
    frontendUrl: process.env.FRONTEND_URL,
    allowedOrigins: process.env.ALLOWED_ORIGINS,
    logLevel: process.env.LOG_LEVEL,
    database: {
      url: process.env.DATABASE_URL,
      poolMax: process.env.DB_POOL_SIZE,
      poolMin: process.env.DB_POOL_MIN,
      sslRejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED,
      slowQueryThreshold: process.env.SLOW_QUERY_THRESHOLD,
    },
    ai: {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      claudeModel: process.env.CLAUDE_MODEL,
      maxTokens: process.env.MAX_TOKENS,
      openaiApiKey: process.env.OPENAI_API_KEY,
      ollamaUrl: process.env.OLLAMA_URL,
    },
    redis: {
      url: process.env.REDIS_URL,
    },
    braveSearchApiKey: process.env.BRAVE_SEARCH_API_KEY,
    judge0ApiKey: process.env.JUDGE0_API_KEY,
    githubToken: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
    resendApiKey: process.env.RESEND_API_KEY,
    stripeSecretKey: process.env.STRIPE_SECRET_KEY,
    sentryDsn: process.env.SENTRY_DSN,
    jwtSecret: process.env.JWT_SECRET,
    encryptionKey: process.env.ENCRYPTION_KEY,
  });
}
