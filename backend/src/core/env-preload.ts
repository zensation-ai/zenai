/**
 * Environment Preloader
 *
 * MUST be imported before any other module that reads process.env.
 * Uses dotenv with override:true to ensure .env values take precedence
 * over empty shell environment variables (e.g. ANTHROPIC_API_KEY="").
 */
import dotenv from 'dotenv';

dotenv.config({ override: true });
